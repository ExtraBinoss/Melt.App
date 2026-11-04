import { expect, it } from "vitest";
import { alphaMatte, foregroundSeed } from "../../../src/services/selection/websam/background";
it("preserves soft alpha, interpolates non-square sources and rejects invalid model outputs", () => {
  const data = alphaMatte(new Float32Array([-20, 0, 20]), [1, 1, 1, 3], 3, 2);
  expect([data[3], data[7], data[11]]).toEqual([0, 128, 255]);
  expect(data[19]).toBe(128);
  const resized = alphaMatte(new Float32Array([-20, 20]), [1, 2], 4, 1);
  expect([3, 7, 11, 15].map((i) => resized[i])).toEqual([0, 64, 191, 255]);
  expect(() => alphaMatte(new Float32Array([NaN]), [1, 1], 1, 1)).toThrow("values");
  expect(() => alphaMatte(new Float32Array(2), [1, 1], 1, 1)).toThrow("dimensions");
  const seed = foregroundSeed(data, 3, 2)!;
  expect(data[(seed.y * 3 + seed.x) * 4 + 3]).toBe(255);
  expect(foregroundSeed(new Uint8ClampedArray(4), 1, 1)).toBeUndefined();
});
