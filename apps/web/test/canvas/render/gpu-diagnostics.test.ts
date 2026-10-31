import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasGpuDiagnostics } from "../../../src/canvas/render/gpu-diagnostics";

afterEach(() => vi.useRealTimers());
describe("canvas diagnostic publication", () => {
  it("bounds expensive reads during frames and publishes the latest trailing state", () => {
    vi.useFakeTimers();
    let now = 0,
      state = 0;
    const read = vi.fn(() => ({ state })),
      publish = vi.fn();
    const diagnostics = new CanvasGpuDiagnostics(
      read,
      publish,
      () => true,
      () => now,
    );
    diagnostics.request();
    for (state = 1; state < 100; state++) diagnostics.request();
    expect(read).toHaveBeenCalledTimes(1);
    now = 250;
    vi.advanceTimersByTime(250);
    expect(read).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenLastCalledWith('{"state":100}');
    diagnostics.dispose();
  });
  it("cancels an overdue trailing publication when a new draw publishes first", () => {
    vi.useFakeTimers();
    let now = 0;
    const publish = vi.fn();
    const diagnostics = new CanvasGpuDiagnostics(
      () => ({}),
      publish,
      () => true,
      () => now,
    );
    diagnostics.request();
    diagnostics.request();
    now = 300;
    diagnostics.request();
    vi.runAllTimers();
    expect(publish).toHaveBeenCalledTimes(2);
    diagnostics.dispose();
  });
  it("does not let a stale canvas owner publish and clears pending work on disposal", () => {
    vi.useFakeTimers();
    let owned = true;
    const read = vi.fn(() => ({})),
      publish = vi.fn();
    const diagnostics = new CanvasGpuDiagnostics(
      read,
      publish,
      () => owned,
      () => 0,
    );
    diagnostics.request();
    diagnostics.request();
    owned = false;
    diagnostics.dispose();
    vi.runAllTimers();
    diagnostics.request();
    expect(read).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);
  });
  it("publishes final resource accounting once before closing", () => {
    vi.useFakeTimers();
    let resources = 8;
    const publish = vi.fn();
    const diagnostics = new CanvasGpuDiagnostics(
      () => ({ resources }),
      publish,
      () => true,
      () => 0,
    );
    diagnostics.request();
    diagnostics.request();
    resources = 0;
    diagnostics.dispose();
    diagnostics.dispose();
    vi.runAllTimers();
    expect(publish.mock.calls.map(([json]) => JSON.parse(json))).toEqual([
      { resources: 8 },
      { resources: 0 },
    ]);
  });
});
