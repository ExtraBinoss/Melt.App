import { expect, it } from "vitest";
import { depthPixels } from "../../../src/services/depth/normalization";
it("maps near depth to white and fixes the video range without per-frame contrast pumping", () => {
  const first = depthPixels(new Float32Array([2, 4, 6]), 3, 1);
  expect([...first.data]).toEqual([255, 255, 255, 255, 128, 128, 128, 255, 0, 0, 0, 255]);
  expect([...depthPixels(new Float32Array([4, 6, 8]), 3, 1, first.range).data]).toEqual([
    128, 128, 128, 255, 0, 0, 0, 255, 0, 0, 0, 255,
  ]);
  expect(depthPixels(new Float32Array([3]), 1, 1).data[0]).toBe(128);
});
it("rejects invalid, negative and nonfinite predictions", () => {
  for (const values of [[NaN], [Infinity], [-1], []])
    expect(() => depthPixels(new Float32Array(values), 1, 1)).toThrow();
});

it("recovers depth detail after a flat opening frame and a disjoint scene cut", () => {
  const flat = depthPixels(new Float32Array([3, 3]), 2, 1);
  const scene = depthPixels(new Float32Array([2, 6]), 2, 1, flat.range);
  expect([scene.data[0], scene.data[4]]).toEqual([255, 0]);
  const cut = depthPixels(new Float32Array([20, 40]), 2, 1, scene.range);
  expect([cut.data[0], cut.data[4]]).toEqual([255, 0]);
});
