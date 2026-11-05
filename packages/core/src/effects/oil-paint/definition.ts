import { AMOUNT, defineEffect } from "../definition";
import { effectFields } from "../shared/fields";

const f = effectFields("oil-paintFx");

export const OIL_PAINT_DEFINITION = Object.freeze({
  ...defineEffect(
    "oil-paint",
    {},
    [
      AMOUNT,
      f.number("brushScale", 6, 0.5, 32, 0.25, "px"),
      f.number("elongation", 1.8, 1, 4),
      f.number("directionality", 0.2, 0, 1),
      f.number("edgePreservation", 0.4, 0, 1),
      f.number("detail", 0.1, 0, 1),
      f.number("centerX", 0.5, 0, 1, 0.001),
      f.number("centerY", 0.5, 0, 1, 0.001),
      f.number("angle", 0, -180, 180, 1, "°"),
    ],
    "effect",
    "preserve",
    { sdk: { direction: "angle", preferredTargets: ["brushScale", "angle", "detail"] } },
  ),
  nameKey: "oil-paintFx:name",
});
