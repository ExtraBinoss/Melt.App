import { AMOUNT, SEED, defineEffect } from "../definition";
import { effectFields } from "../shared/fields";

const f = effectFields("watercolorFx");

export const WATERCOLOR_DEFINITION = Object.freeze({
  ...defineEffect(
    "watercolor",
    {},
    [
      AMOUNT,
      f.number("washScale", 5, 0.5, 18, 0.25, "px"),
      f.number("simplification", 0.7, 0, 1),
      f.number("edgePreservation", 0.55, 0, 1),
      f.number("diffusion", 0.45, 0, 1),
      f.number("pigment", 0.65, 0, 1),
      f.number("edgeDarkening", 0.4, 0, 1),
      f.number("granulation", 0.4, 0, 1),
      f.number("paperGrain", 0.35, 0, 1),
      f.number("paperScale", 1.5, 0.5, 8, 0.1, "px"),
      f.number("paperOpacity", 0.12, 0, 1),
      f.color("paperColor", "#fff8e8"),
      SEED,
    ],
    "effect",
    "preserve",
    { identityAtZero: true, sdk: { preferredTargets: ["washScale", "diffusion", "pigment"] } },
  ),
  nameKey: "watercolorFx:name",
});
