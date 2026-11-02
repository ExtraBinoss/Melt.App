import { expect, it } from "vitest";
import { promptTensors } from "../../../src/services/selection/prompts";
it("encodes foreground/background points, box corners and padding at the correct non-square scale", () => {
  const points = [
    { x: 10, y: 20, label: 1 as const },
    { x: 50, y: 80, label: 0 as const },
  ];
  const result = promptTensors({ points }, 100, 200, 512);
  expect(Array.from(result.labels)).toEqual([1, 0, -1]);
  expect(Array.from(result.coordinates)).toEqual(
    Array.from(new Float32Array([51.2, 51.2, 256, 204.8, 0, 0])),
  );
  expect(result.count).toBe(3);
  const box = promptTensors({ points, box: { x: 0, y: 0, right: 99, bottom: 199 } }, 100, 200, 512);
  expect(Array.from(box.labels)).toEqual([2, 3, 1, 0]);
  expect(box.count).toBe(4);
});
it("rejects empty, nonfinite, out-of-bounds, invalid label and oversized prompt sets", () => {
  expect(() => promptTensors({ points: [] }, 100, 100, 512)).toThrow("needs");
  for (const x of [NaN, Infinity, -1, 100])
    expect(() => promptTensors({ points: [{ x, y: 0, label: 1 }] }, 100, 100, 512)).toThrow(
      "outside",
    );
  expect(() =>
    promptTensors(
      { points: Array.from({ length: 65 }, () => ({ x: 0, y: 0, label: 1 as const })) },
      100,
      100,
      512,
    ),
  ).toThrow("Too many");
  expect(() =>
    promptTensors({ points: [], box: { x: 5, y: 5, right: 1, bottom: 1 } }, 100, 100, 512),
  ).toThrow("rectangle");
  expect(() => promptTensors({ points: [{ x: 0, y: 0, label: 4 as 1 }] }, 100, 100, 512)).toThrow(
    "label",
  );
});
