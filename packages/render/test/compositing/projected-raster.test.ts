import { expect, test } from "vitest";
import { Matrix3 } from "three/webgpu";
import { projectedRaster } from "../../src/compositing/projected-raster";
import { clipProjectedBounds } from "../../src/compositing/projected-window";
import { projectedEffectBounds } from "../../src/compositing/projected-effects";

test.each([
  [26979, 6497],
  [8439, 2265],
])(
  "bounds a %i×%i logical grazing plane without changing its coordinate domain",
  (width, height) => {
    const bounds = { x: -130, y: 27, width, height };
    const raster = projectedRaster(bounds, 1, 8192, 4 * 1024 * 1024);
    expect(raster.width).toBeLessThanOrEqual(8192);
    expect(raster.height).toBeLessThanOrEqual(8192);
    expect(raster.width * raster.height).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(raster.scale).toBeLessThan(1);
    expect(bounds).toEqual({ x: -130, y: 27, width, height });
    // Texel centers continue to span the whole logical field, rather than truncating it.
    expect(bounds.x + (raster.width / 2 / raster.width) * bounds.width).toBe(-130 + width / 2);
  },
);

test("ordinary references retain exact raster density, and thin planes honor the integer pixel budget", () => {
  expect(projectedRaster({ width: 200, height: 100 }, 2, 8192, 100000)).toEqual({
    width: 400,
    height: 200,
    scale: 2,
  });
  const thin = projectedRaster({ width: 1e8, height: 0.001 }, 1, 8192, 1024);
  expect(thin.width * thin.height).toBeLessThanOrEqual(1024);
  expect(() => projectedRaster({ width: 1, height: 1 }, 1, 0, 1024)).toThrow(/budget/);
});

test("clips an expanding homography against the actual output window before horizon division", () => {
  const window = { x: -10, y: -20, width: 640, height: 480 };
  const matrix = new Matrix3().set(1, 0, 0, 0, 1, 0, 1, 0, -1);
  const source = { x: 0, y: 0, width: 2, height: 100 };
  const visible = clipProjectedBounds(source, matrix, window);
  expect(visible.x).toBeGreaterThanOrEqual(window.x);
  expect(visible.y).toBeGreaterThanOrEqual(window.y);
  expect(visible.x + visible.width).toBeLessThanOrEqual(window.x + window.width + 1e-6);
  expect(visible.y + visible.height).toBeLessThanOrEqual(window.y + window.height + 1e-6);
  const authored = projectedEffectBounds(source, matrix, 1);
  expect(Object.values(authored).every(Number.isFinite)).toBe(true);
  const raster = projectedRaster(authored, 1, 8192, 4 * 1024 * 1024);
  expect(raster.width * raster.height).toBeLessThanOrEqual(4 * 1024 * 1024);
});
