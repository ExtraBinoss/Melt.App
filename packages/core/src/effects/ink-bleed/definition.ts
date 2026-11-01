import { AMOUNT, SEED, defineEffect } from "../definition";
import { effectFields } from "../shared/fields";
const f = effectFields("ink-bleedFx");
export const INK_BLEED_DEFINITION = defineEffect(
  "ink-bleed",
  {},
  [
    AMOUNT,
    f.choice("source", "luminance", ["luminance", "alpha"]),
    f.number("radius", 5, 0, 32, 0.25, "px"),
    f.number("density", 1.2, 0, 3),
    f.number("threshold", 0.3, 0, 1),
    f.number("softness", 0.25, 0.01, 1),
    f.number("roughness", 0.7, 0, 1),
    f.number("paperScale", 8, 1, 64, 1, "px"),
    f.boolean("colorize", false),
    { ...f.color("inkColor", "#211b24"), visibleWhen: { key: "colorize", values: ["true"] } },
    { ...SEED, labelKey: "ink-bleedFx:parameter.seed" },
  ],
  "effect",
  "expand",
  { identityAtZero: true },
);
