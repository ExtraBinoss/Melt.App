import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { hasEffectTreatment } from "../../../src/effects/shared/active";
import { effectStages } from "../../../src/effects/pipeline";
it("never prepares or renders a retired scan, including old compositing modes", () => {
  for (const composite of [undefined, "clear", "copy"] as const) {
    const effect = createEffect("time-warp-scan", { enabled: true, amount: 1, composite });
    expect(hasEffectTreatment(effect)).toBe(false);
    expect(effectStages(effect)).toEqual([]);
  }
  expect(hasEffectTreatment(createEffect("thermal"))).toBe(true);
});
