import { afterEach, expect, it, vi } from "vitest";
import { createDepthScheduling } from "../../../src/services/depth/scheduling";
afterEach(() => vi.useRealTimers());
it("pauses new GPU jobs during a pointer gesture, recent wheel input and hidden documents", () => {
  vi.useFakeTimers();
  const scheduler = createDepthScheduling(),
    ready = vi.fn();
  document.dispatchEvent(new MouseEvent("pointerdown"));
  scheduler.request(ready);
  vi.advanceTimersByTime(500);
  expect(ready).not.toHaveBeenCalled();
  document.dispatchEvent(new MouseEvent("pointerup"));
  vi.advanceTimersByTime(100);
  expect(ready).not.toHaveBeenCalled();
  vi.advanceTimersByTime(100);
  expect(ready).toHaveBeenCalledTimes(1);
  scheduler.request(ready);
  document.dispatchEvent(new WheelEvent("wheel"));
  vi.advanceTimersByTime(100);
  expect(ready).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(100);
  expect(ready).toHaveBeenCalledTimes(2);
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  scheduler.request(ready);
  vi.advanceTimersByTime(500);
  expect(ready).toHaveBeenCalledTimes(2);
  hidden.mockReturnValue(false);
  vi.advanceTimersByTime(100);
  expect(ready).toHaveBeenCalledTimes(3);
  scheduler.dispose();
  hidden.mockRestore();
  expect(vi.getTimerCount()).toBe(0);
});
it("disposes timers and listeners without admitting a cancelled frame", () => {
  vi.useFakeTimers();
  const scheduler = createDepthScheduling(),
    ready = vi.fn();
  scheduler.request(ready);
  scheduler.dispose();
  document.dispatchEvent(new WheelEvent("wheel"));
  vi.advanceTimersByTime(1000);
  expect(ready).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
