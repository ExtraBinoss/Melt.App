import { expect, test } from "vitest";
import {
  gestureGain,
  gestureQuantum,
  snapNumericValue,
} from "../../../src/components/shared/numeric-gesture";

test("Shift and deliberate slow movement reduce future deltas without changing the existing value", () => {
  expect(gestureGain(true, 20, 10)).toBe(0.1);
  expect(gestureGain(false, 1, 20)).toBe(0.25);
  expect(gestureGain(false, 20, 10)).toBe(1);
  expect(gestureGain(false, 1, 500)).toBe(1);
});

test("magnetic values include zero, integers and halves, respect precision and cannot exceed the domain", () => {
  for (const [value, expected] of [
    [0.02, 0],
    [0.48, 0.5],
    [0.99, 1],
    [2.03, 2],
  ])
    expect(snapNumericValue(value!, -5, 5, 0.01, 0.04)).toEqual({
      value: expected,
      target: expected,
    });
  expect(snapNumericValue(0.27, -5, 5, 0.01, 0.04)).toEqual({ value: 0.27, target: null });
  expect(snapNumericValue(-5, 0.001, 5, 0.01, 0.04).value).toBe(0.001);
  expect(snapNumericValue(50, 0, 3, 0.1, 0.04).value).toBe(3);
});

test("Shift chooses five or ten useful units according to gesture speed and property range", () => {
  expect(gestureQuantum(0, 100, 1, 0.1)).toBe(5);
  expect(gestureQuantum(0, 100, 1, 1)).toBe(10);
  expect(gestureQuantum(0, 5, 0.01, 0.1)).toBe(0.05);
  expect(gestureQuantum(0, 5, 0.01, 1)).toBe(0.1);
});
