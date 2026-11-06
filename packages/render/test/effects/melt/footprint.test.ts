import { expect, test } from "vitest";
import { createEffect } from "@musart/core";
import { meltFootprint } from "../../../src/effects/melt/footprint";

test.each([
  [0, { left: 0, right: 97, top: 0, bottom: 0 }],
  [90, { left: 0, right: 0, top: 0, bottom: 97 }],
  [-90, { left: 0, right: 0, top: 97, bottom: 0 }],
  [180, { left: 97, right: 0, top: 0, bottom: 0 }],
  [45, { left: 0, right: 69, top: 0, bottom: 69 }],
] as const)("melt admits directional silhouette pulls at %s degrees", (angle, bounds) => {
  expect(meltFootprint(createEffect("melt", { settings: { distance: 96, angle } }))).toEqual(
    bounds,
  );
});

test("melt amount and field animation retain admitted transport support", () => {
  const effect = createEffect("melt", { settings: { distance: 512, angle: 90 } }),
    initial = meltFootprint(effect);
  expect(initial).toEqual({ left: 0, right: 0, top: 0, bottom: 513 });
  expect(
    meltFootprint({
      ...effect,
      amount: 0,
      seed: 2147483647,
      settings: {
        ...effect.settings,
        phase: 137,
        liquidity: 1,
        toneInfluence: 1,
        tone: "shadows",
        dripScale: 2,
      },
    }),
  ).toEqual(initial);
  expect(meltFootprint(createEffect("melt", { settings: { distance: 0 } }))).toEqual({
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  });
});
