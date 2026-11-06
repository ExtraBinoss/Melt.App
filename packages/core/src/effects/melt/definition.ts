import { AMOUNT, SEED, defineEffect } from "../definition";
import { effectFields } from "../shared/fields";

const f = effectFields("meltFx");

/** Source-colored viscous displacement; phase is authored and random-access. */
export const MELT_DEFINITION = Object.freeze({
  ...defineEffect(
    "melt",
    {},
    [
      { ...AMOUNT, labelKey: "meltFx:parameter.amount" },
      f.number("distance", 96, 0, 512, 0.5, "px"),
      f.number("angle", 90, -180, 180, 1, "°"),
      f.number("liquidity", 0.75, 0, 1),
      f.number("dripScale", 32, 2, 256, 0.5, "px"),
      f.number("toneInfluence", 0.6, 0, 1),
      f.choice("tone", "highlights", ["highlights", "shadows"]),
      f.number("phase", 0, 0, 360, 1, "°"),
      { ...SEED, labelKey: "meltFx:parameter.seed" },
    ],
    "effect",
    "expand",
    {
      sdk: {
        direction: "angle",
        preferredTargets: ["phase", "distance", "liquidity"],
        preview: { source: "editorial-portrait", scene: "photo" },
      },
    },
  ),
  nameKey: "meltFx:name",
});
