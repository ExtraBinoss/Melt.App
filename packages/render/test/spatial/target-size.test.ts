import { expect, test, vi } from "vitest";
import { RenderTarget } from "three/webgpu";
import { prepareSpatialTarget, spatialTargetSize } from "../../src/spatial/target-size";

test("camera source storage retains buckets while the native viewport stays pixel exact", () => {
  const target = new RenderTarget(1, 1);
  const dispose = vi.spyOn(target, "dispose");
  try {
    for (let width = 257; width <= 290; width++) {
      const size = spatialTargetSize(target, width, 197, true, 8192);
      target.setSize(size.width, size.height);
      target.viewport.set(0, 0, width, 197);
      expect(target.width).toBe(320);
      expect(target.height).toBe(256);
      expect(target.viewport.toArray()).toEqual([0, 0, width, 197]);
    }
    expect(dispose).toHaveBeenCalledOnce();
    // A small reversal across a bucket boundary must not ping-pong allocations.
    expect(spatialTargetSize(target, 255, 193, true, 8192)).toEqual({ width: 320, height: 256 });
    expect(spatialTargetSize(target, 128, 96, true, 8192)).toEqual({ width: 128, height: 128 });
    // Exact jobs never keep preview padding or change the delivered resolution.
    expect(spatialTargetSize(target, 259, 197, false, 8192)).toEqual({ width: 259, height: 197 });
    expect(spatialTargetSize(target, 8185, 197, true, 8191)).toEqual({ width: 8191, height: 256 });
    expect(() => spatialTargetSize(target, 8193, 197, true, 8192)).toThrow();
  } finally {
    target.dispose();
  }
});

test("optional padding falls back before allocation and failed admission preserves the existing surface", () => {
  const target = new RenderTarget(1, 1),
    dispose = vi.spyOn(target, "dispose");
  const tight = vi.fn((width: number, height: number) => {
    expect(target.width).toBe(1);
    if (width * height > 259 * 197) throw Error("GPU budget exceeded");
  });
  try {
    prepareSpatialTarget(target, 259, 197, true, 8192, tight);
    expect(tight.mock.calls).toEqual([
      [320, 256],
      [259, 197],
    ]);
    expect(dispose).toHaveBeenCalledOnce();
    expect(target.viewport.toArray()).toEqual([0, 0, 259, 197]);
    const before = target.viewport.clone();
    const reject = vi.fn(() => {
      throw Error("GPU budget exceeded");
    });
    expect(() => prepareSpatialTarget(target, 400, 300, true, 8192, reject)).toThrow(
      "GPU budget exceeded",
    );
    expect(target.width).toBe(259);
    expect(target.height).toBe(197);
    expect(target.viewport.equals(before)).toBe(true);
    expect(dispose).toHaveBeenCalledOnce();
    expect(() => prepareSpatialTarget(target, 8193, 1, true, 8192, reject)).toThrow("device limit");
    expect(reject).toHaveBeenCalledTimes(2);
  } finally {
    target.dispose();
  }
});
