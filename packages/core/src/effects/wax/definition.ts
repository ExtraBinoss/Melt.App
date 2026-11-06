import { AMOUNT, defineEffect } from "../definition";
import { effectFields } from "../shared/fields";

const f = effectFields("waxFx");

export const WAX_DEFINITION = Object.freeze({
  ...defineEffect(
    "wax",
    {},
    [
      AMOUNT,
      f.number("blur", 4, 0.5, 20, 0.25, "px"),
      f.number("relief", 1.4, 0, 4),
      f.number("translucence", 0.55, 0, 1),
      f.number("gloss", 0.42, 0, 1),
      f.number("glow", 0.65, 0, 2),
      f.number("brightness", 0.95, 0, 2),
      f.number("aberration", 0.18, 0, 1),
      f.number("tint", 0.22, 0, 1),
      f.color("waxColor", "#ffe9c6"),
      f.number("lightAngle", 315, 0, 360, 1, "°"),
      f.number("lightElevation", 45, 5, 85, 1, "°"),
    ],
    "effect",
    "preserve",
    {
      identityAtZero: true,
      sdk: {
        direction: "lightAngle",
        preferredTargets: ["blur", "relief", "translucence"],
        preview: { source: "studio-still-life", scene: "photo" },
      },
    },
  ),
  nameKey: "waxFx:name",
});
