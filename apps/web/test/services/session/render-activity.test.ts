import { expect, it, vi } from "vitest";
import { EditorEngine, createProject } from "@musart/core";
import { getCanonicalPresentation } from "../../../src/state/session/canonical-presentation";
import { createRenderActivity } from "../../../src/services/session/render-activity";
import { createMotionTransport } from "../../../src/services/motion/transport";

it("blocks optional GPU work throughout Motion playback and notifies only on transitions", () => {
  let tick: FrameRequestCallback | undefined,
    sequence = 0;
  const now = vi.spyOn(performance, "now").mockReturnValue(0);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    tick = callback;
    return ++sequence;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const engine = new EditorEngine(createProject());
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const activity = createRenderActivity(engine);
  const transport = createMotionTransport(engine);
  const notify = vi.fn(),
    stop = activity.subscribe(notify);
  expect(activity.busy()).toBe(false);
  transport.play();
  expect(activity.busy()).toBe(true);
  expect(notify).toHaveBeenCalledTimes(1);
  for (let index = 1; index <= 20; index++) {
    now.mockReturnValue(index * 10);
    tick!(index * 10);
  }
  expect(notify).toHaveBeenCalledTimes(1);
  transport.pause();
  expect(activity.busy()).toBe(false);
  expect(notify).toHaveBeenCalledTimes(2);
  stop();
  transport.play();
  expect(notify).toHaveBeenCalledTimes(2);
  transport.dispose();
});

it("gives foreground startup priority over optional work and releases only after a fresh acknowledged frame", () => {
  const engine = new EditorEngine(createProject());
  const activity = createRenderActivity(engine),
    presentation = getCanonicalPresentation(engine);
  expect(createRenderActivity(engine)).toBe(activity);
  const changed = vi.fn(),
    stop = activity.subscribe(changed);
  const cancel = activity.holdUntilPresented();
  expect(activity.busy()).toBe(true);
  const owner = presentation.acquire();
  const origin = {
    projectId: engine.getSnapshot().project.id,
    revision: engine.getSnapshot().revision,
  };
  const ticket = owner.request(origin, true);
  expect(activity.busy()).toBe(true);
  owner.present(ticket);
  expect(activity.busy()).toBe(false);
  expect(changed).toHaveBeenCalledTimes(2);
  cancel();
  expect(changed).toHaveBeenCalledTimes(2);
  const old = activity.holdUntilPresented(),
    latest = activity.holdUntilPresented();
  old();
  expect(activity.busy()).toBe(true);
  latest();
  expect(activity.busy()).toBe(false);
  const repeated = activity.holdUntilPresented();
  expect(activity.busy()).toBe(true);
  owner.present(ticket);
  expect(activity.busy()).toBe(true);
  const fresh = owner.request(origin, true);
  owner.present(fresh);
  expect(activity.busy()).toBe(false);
  repeated();
  stop();
  owner.release();
});
