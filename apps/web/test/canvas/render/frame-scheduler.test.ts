import { afterEach, expect, test, vi } from "vitest";
import { CanvasFrameScheduler } from "../../../src/canvas/render/frame-scheduler";

afterEach(() => vi.unstubAllGlobals());

test("playing work begins after the current stack without an extra animation-frame wait", () => {
  const microtasks: (() => void)[] = [],
    raf = vi.fn(),
    work = vi.fn();
  vi.stubGlobal("queueMicrotask", (callback: () => void) => microtasks.push(callback));
  vi.stubGlobal("requestAnimationFrame", raf);
  const scheduler = new CanvasFrameScheduler();
  scheduler.schedule(true, work);
  scheduler.schedule(true, work);
  expect(work).not.toHaveBeenCalled();
  expect(raf).not.toHaveBeenCalled();
  expect(scheduler.pending).toBe(true);
  expect(microtasks).toHaveLength(1);
  microtasks[0]!();
  expect(work).toHaveBeenCalledOnce();
  expect(scheduler.pending).toBe(false);
});

test("cancellation prevents stale microtasks from consuming a replacement and cancels idle RAFs", () => {
  const microtasks: (() => void)[] = [],
    frames: (() => void)[] = [];
  const cancel = vi.fn(),
    stale = vi.fn(),
    current = vi.fn();
  vi.stubGlobal("queueMicrotask", (callback: () => void) => microtasks.push(callback));
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => frames.push(callback));
  vi.stubGlobal("cancelAnimationFrame", cancel);
  const scheduler = new CanvasFrameScheduler();
  scheduler.schedule(true, stale);
  scheduler.clear();
  scheduler.schedule(true, current);
  microtasks[0]!();
  expect(scheduler.pending).toBe(true);
  microtasks[1]!();
  expect(stale).not.toHaveBeenCalled();
  expect(current).toHaveBeenCalledOnce();
  scheduler.schedule(false, stale);
  scheduler.clear();
  frames[0]!();
  expect(cancel).toHaveBeenCalledWith(1);
  expect(stale).not.toHaveBeenCalled();
  expect(scheduler.pending).toBe(false);
});
