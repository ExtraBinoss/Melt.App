import { expect, test } from "vitest";
import { estimateVideoBytes } from "../../../src/components/export/estimate";
test("estimates target video/audio bytes and excludes invalid settings", () => {
  expect(estimateVideoBytes(2, 8_000_000)).toBe(2_040_000);
  expect(estimateVideoBytes(2, 8_000_000, true)).toBe(2_088_960);
  for (const value of [0, -1, NaN, Infinity])
    expect(estimateVideoBytes(value, 8_000_000)).toBeNull();
});
