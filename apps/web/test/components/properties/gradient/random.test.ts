import { expect, test } from "vitest";
import { validateFillGradient } from "@musart/core";
import { randomGradient } from "../../../../src/components/properties/gradient/random";
test("randomizes type, angle, stop count, positions and RGBA colors within portable limits", () => {
  let seed = 112358;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const paints = Array.from({ length: 256 }, () => randomGradient(random));
  for (const paint of paints) expect(() => validateFillGradient(paint)).not.toThrow();
  expect(new Set(paints.map((paint) => paint.kind)).size).toBe(2);
  expect([...new Set(paints.map((paint) => paint.stops.length))].sort((a, b) => a - b)).toEqual([
    2, 3, 4, 5, 6, 7, 8,
  ]);
  expect(new Set(paints.map((paint) => paint.angle)).size).toBeGreaterThan(100);
  expect(
    new Set(paints.flatMap((paint) => paint.stops.map((stop) => stop.color))).size,
  ).toBeGreaterThan(1000);
  expect(
    new Set(paints.flatMap((paint) => paint.stops.slice(1, -1).map((stop) => stop.offset))).size,
  ).toBeGreaterThan(500);
  expect(randomGradient(() => 0).stops).toHaveLength(2);
  expect(randomGradient(() => 0.999999).stops).toHaveLength(8);
});
