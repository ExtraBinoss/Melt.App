import { expect, test, vi } from "vitest";
import { ViewMotion } from "../../../src/canvas/viewport/motion";
function fixture(reduced = false) {
  let time = 0,
    id = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const motion = new ViewMotion({
    reduced: () => reduced,
    constrain: (view) => view,
    clock: {
      now: () => time,
      request: (callback) => {
        frames.set(++id, callback);
        return id;
      },
      cancel: (handle) => {
        frames.delete(handle);
      },
    },
  });
  return {
    motion,
    frames,
    elapse(to: number) {
      time = to;
    },
    step(to: number) {
      time = to;
      const pending = [...frames.values()];
      frames.clear();
      for (const frame of pending) frame(time);
    },
  };
}
test("a burst cannot queue a distant target or catch up in a single frame after a stall", () => {
  const d = fixture(),
    paint = vi.fn(),
    settled = vi.fn();
  d.motion.subscribe(paint);
  d.motion.subscribeSettled(settled);
  for (let i = 0; i < 200; i++) d.motion.zoomWheel(1.2, { x: 50, y: 20 });
  expect(d.frames.size).toBe(1);
  expect(paint).toHaveBeenCalledTimes(1);
  expect(d.motion.read().zoom).toBe(1);
  d.step(1000);
  expect(d.motion.read().zoom).toBeGreaterThan(1);
  expect(d.motion.read().zoom).toBeLessThan(1.16);
  for (let t = 1016; t <= 1200; t += 16) d.step(t);
  expect(d.motion.read().zoom).toBeCloseTo(1.18);
  expect(settled).toHaveBeenCalledOnce();
  expect(d.frames.size).toBe(0);
});
test("wheel follows the pointer, reverses immediately and publishes only after the gesture settles", () => {
  const d = fixture(),
    settled = vi.fn(),
    anchor = { x: 120, y: -70 };
  d.motion.subscribeSettled(settled);
  for (let t = 0; t < 160; t += 16) {
    d.motion.zoomWheel(1.02, anchor);
    d.step(t + 16);
    const v = d.motion.read();
    expect((anchor.x - v.x) / v.zoom).toBeCloseTo(anchor.x, 9);
    expect((anchor.y - v.y) / v.zoom).toBeCloseTo(anchor.y, 9);
  }
  expect(settled).not.toHaveBeenCalled();
  const before = d.motion.read().zoom;
  d.motion.zoomWheel(0.98, anchor);
  d.step(176);
  expect(d.motion.read().zoom).toBeLessThan(before);
  for (let t = 192; t <= 320; t += 16) d.step(t);
  expect(settled).toHaveBeenCalledOnce();
});
test("reduced motion remains direct and disposal cancels the one pending wheel frame", () => {
  const direct = fixture(true);
  direct.motion.zoomWheel(2, { x: 0, y: 0 });
  expect(direct.motion.read().zoom).toBe(2);
  expect(direct.frames.size).toBe(0);
  const d = fixture();
  d.motion.zoomWheel(1.1, { x: 0, y: 0 });
  d.motion.dispose();
  expect(d.frames.size).toBe(0);
  d.motion.zoomWheel(2, { x: 0, y: 0 });
  expect(d.frames.size).toBe(0);
});

test("interrupting wheel navigation keeps the last visible pose instead of applying pending input", () => {
  const d = fixture();
  d.motion.zoomWheel(1.18, { x: 50, y: 20 });
  d.step(16);
  const visible = d.motion.read();
  d.elapse(1000);
  d.motion.stop();
  expect(d.motion.read()).toBe(visible);
  expect(d.frames.size).toBe(0);
});
