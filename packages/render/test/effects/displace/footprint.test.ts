import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { effectFootprint } from "../../../src/effects/shared/footprint";
it("admits displaced silhouettes and dispersion without reallocating through amount animation", () => {
  const effect = createEffect("displace", {
    settings: { strengthX: -100, strengthY: 20, contrast: 2, midpoint: 0.25, dispersion: 1 },
  });
  const bounds = effectFootprint([effect]);
  expect(bounds).toEqual({ left: 181, right: 181, top: 37, bottom: 37 });
  expect(effectFootprint([{ ...effect, amount: 0 }])).toEqual(bounds);
  expect(effectFootprint([{ ...effect, enabled: false }])).toEqual({
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  });
  expect(
    effectFootprint([{ ...effect, settings: { ...effect.settings, preserveAlpha: true } }]),
  ).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
});
