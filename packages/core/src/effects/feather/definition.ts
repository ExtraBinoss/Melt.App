import { AMOUNT, defineEffect, type NumberEffectParameter } from "../definition";
const number = (key: string, value: number, min: number, max: number): NumberEffectParameter => ({
  kind: "number",
  scope: "settings",
  key,
  default: value,
  labelKey: `featherFx:parameter.${key}`,
  min,
  max,
  step: 0.01,
  displayScale: 100,
  unit: "%",
});
/** A reusable soft elliptical alpha edge in normalized authored layer coordinates. */
export const FEATHER_DEFINITION = defineEffect(
  "feather",
  {
    settings: { centerX: 0.5, centerY: 0.5, radius: 0.72, softness: 0.3 },
  },
  [
    AMOUNT,
    number("centerX", 0.5, 0, 1),
    number("centerY", 0.5, 0, 1),
    number("radius", 0.72, 0.01, 2),
    number("softness", 0.3, 0.01, 2),
  ],
  "effect",
  "reduce",
);
