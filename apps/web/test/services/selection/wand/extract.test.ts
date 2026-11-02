import { expect, it } from "vitest";
import { extractPixels } from "../../../../src/services/selection/wand/extract";
it("copies only selected RGBA, tightens bounds and retains fractional alpha and holes", () => {
  const data = new Uint8ClampedArray(4 * 3 * 4);
  data.set([10, 20, 30, 255], (1 * 4 + 1) * 4);
  data.set([40, 50, 60, 128], (1 * 4 + 2) * 4);
  data.set([70, 80, 90, 255], (2 * 4 + 2) * 4);
  const coverage = new Uint8Array(12);
  coverage[5] = 255;
  coverage[6] = 128;
  coverage[10] = 255;
  const before = data.slice(),
    result = extractPixels(data, coverage, 4, 3)!;
  expect(result).toMatchObject({ x: 1, y: 1, width: 2, height: 2 });
  expect(Array.from(result.data)).toEqual([
    10, 20, 30, 255, 40, 50, 60, 64, 0, 0, 0, 0, 70, 80, 90, 255,
  ]);
  expect(data).toEqual(before);
});
it("returns no image for empty or entirely transparent selections and rejects malformed data", () => {
  expect(extractPixels(new Uint8ClampedArray(4), new Uint8Array([255]), 1, 1)).toBeNull();
  expect(
    extractPixels(new Uint8ClampedArray([1, 2, 3, 255]), new Uint8Array([0]), 1, 1),
  ).toBeNull();
  expect(() => extractPixels(new Uint8ClampedArray(3), new Uint8Array([255]), 1, 1)).toThrow(
    "dimensions",
  );
});
