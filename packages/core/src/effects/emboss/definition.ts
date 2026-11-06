import { AMOUNT, defineEffect } from "../definition";
import { effectFields } from "../shared/fields";

const f = effectFields("embossFx");

/** A shaded height-field treatment; this does not extrude native scene geometry. */
export const EMBOSS_DEFINITION = Object.freeze({
  ...defineEffect(
    "emboss",
    {},
    [
      { ...AMOUNT, labelKey: "embossFx:parameter.amount" },
      f.choice("mode", "raised", ["raised", "recessed", "pillow", "outline"]),
      f.choice("height", "luminance", ["luminance", "alpha"]),
      f.choice("material", "neutral", ["source", "neutral"]),
      {
        ...f.color("materialColor", "#b8b5ad"),
        visibleWhen: { key: "material", values: ["neutral"] },
      },
      f.number("size", 5, 0.25, 128, 0.25, "px"),
      f.number("softness", 0.65, 0, 1),
      f.number("depth", 5, 0, 32, 0.1),
      f.number("azimuth", 135, 0, 360, 1, "°"),
      f.number("altitude", 35, 1, 89, 1, "°"),
      f.number("ambient", 0.6, 0, 1),
      f.number("highlight", 0.8, 0, 2),
      f.number("shadow", 0.8, 0, 2),
      f.number("gloss", 12, 1, 64, 1),
    ],
    "effect",
    "preserve",
    {
      identityAtZero: true,
      sdk: { direction: "azimuth", preferredTargets: ["depth", "azimuth", "size"] },
    },
  ),
  nameKey: "embossFx:name",
});
