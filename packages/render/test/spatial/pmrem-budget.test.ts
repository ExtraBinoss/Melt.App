import { expect, test } from "vitest";
import { pmremSize, pmremTargetBytes, pmremScratchBytes } from "../../src/spatial/pmrem-budget";
import { REFLECTION_BUDGETS } from "../../src/spatial/reflections/model";

test("reserves every cube face and authored mip before native PMREM allocation", () => {
  expect(pmremSize(128)).toBe(256);
  expect(pmremSize(700)).toBe(512);
  const pixels = [256, 128, 64, 32, 16, 8].reduce((sum, size) => sum + size * size, 0);
  expect(pmremTargetBytes(256)).toBe(6 * 8 * pixels);
  expect(pmremTargetBytes(128)).toBe(pmremTargetBytes(256));
  expect(pmremScratchBytes(1024)).toBeGreaterThan(6 * 12 * 1024 * 1024);
  expect(pmremScratchBytes(256)).toBe(32 * 1024 * 1024);
  for (const budget of Object.values(REFLECTION_BUDGETS))
    expect(budget.size).toBe(pmremSize(budget.size));
});
