import { AMOUNT, defineEffect } from "../definition";
import { effectFields } from "../shared/fields";
const f = effectFields("liquifyFx");
export const LIQUIFY_MODES = [
  "push",
  "pinch",
  "bloat",
  "twirl-cw",
  "twirl-ccw",
  "restore",
] as const;
export const LIQUIFY_DEFINITION = defineEffect(
  "liquify",
  {},
  [
    AMOUNT,
    f.choice("brushMode", "push", LIQUIFY_MODES),
    f.number("brushRadius", 48, 2, 1024, 1, "px"),
    f.number("brushStrength", 0.5, 0.01, 1),
    f.boolean("stylusPressure", true),
    f.number("brushHardness", 0.2, 0, 0.99),
  ],
  "effect",
  "expand",
);
