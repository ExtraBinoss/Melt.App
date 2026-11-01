import { expect, test, vi } from "vitest";
import { EditorEngine, createProject } from "@musart/core";
import { animationPresentation } from "../../../../src/components/motion/animations/presentation";
import { motionDiamondVisibility } from "../../../../src/components/properties/motion/diamond-visibility";
import { createMotionTransport } from "../../../../src/services/motion/transport";

test("visibility shares subscriptions and releases both sources after the last field leaves", () => {
  const engine = new EditorEngine(createProject());
  const listeners = new Set<() => void>();
  const subscribe = engine.subscribe;
  vi.spyOn(engine, "subscribe").mockImplementation((listener) => {
    listeners.add(listener);
    const stop = subscribe(listener);
    return () => {
      listeners.delete(listener);
      stop();
    };
  });
  const visibility = motionDiamondVisibility(engine);
  expect(motionDiamondVisibility(engine)).toBe(visibility);
  const first = vi.fn(),
    second = vi.fn();
  const stopFirst = visibility.subscribe(first);
  expect(listeners.size).toBe(2);
  const stopSecond = visibility.subscribe(second);
  expect(listeners.size).toBe(2);
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  expect(first).not.toHaveBeenCalled();
  animationPresentation(engine).set({ details: true });
  expect(visibility.read()).toBe(true);
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
  stopFirst();
  expect(listeners.size).toBe(2);
  stopSecond();
  expect(listeners.size).toBe(0);
  animationPresentation(engine).set({ details: false });
  expect(visibility.read()).toBe(false);
  const stopAgain = visibility.subscribe(first);
  expect(listeners.size).toBe(2);
  stopAgain();
  expect(listeners.size).toBe(0);
});

test("playhead and unrelated presentation changes do not notify hidden or visible fields", () => {
  const engine = new EditorEngine(createProject());
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const visibility = motionDiamondVisibility(engine),
    notify = vi.fn();
  const stop = visibility.subscribe(notify);
  const transport = createMotionTransport(engine);
  for (let index = 0; index < 10; index++) transport.seek({ value: index, rate: 24 });
  expect(notify).not.toHaveBeenCalled();
  animationPresentation(engine).set({ details: true });
  expect(notify).toHaveBeenCalledTimes(1);
  for (let index = 10; index < 20; index++) transport.seek({ value: index, rate: 24 });
  animationPresentation(engine).set({ selected: "unrelated-animation" });
  expect(notify).toHaveBeenCalledTimes(1);
  expect(visibility.read()).toBe(true);
  engine.execute({ type: "setCompositionMode", mode: "static" });
  expect(notify).toHaveBeenCalledTimes(2);
  expect(visibility.read()).toBe(false);
  stop();
  transport.dispose();
});
