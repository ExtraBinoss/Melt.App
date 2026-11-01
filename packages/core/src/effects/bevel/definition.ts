import { AMOUNT, defineEffect, type EffectParameter } from "../definition";
const number = (
  key: string,
  value: number,
  min: number,
  max: number,
  step = 0.01,
  unit = "",
): EffectParameter => ({
  kind: "number",
  scope: "settings",
  key,
  default: value,
  labelKey: "materialFx:parameter." + key,
  min,
  max,
  step,
  displayScale: 1,
  unit,
});
const choice = (key: string, value: string, options: readonly string[]): EffectParameter => ({
  kind: "select",
  scope: "settings",
  key,
  default: value,
  labelKey: "materialFx:parameter." + key,
  options: options.map((value) => ({ value, labelKey: "materialFx:choice." + value })),
});
const color = (key: string, value: string): EffectParameter => ({
  kind: "color",
  scope: "settings",
  key,
  default: value,
  labelKey: "materialFx:parameter." + key,
});
export const BEVEL_DEFINITION = defineEffect(
  "bevel",
  {},
  [
    { ...AMOUNT, labelKey: "materialFx:parameter.amount" },
    choice("height", "alpha", ["alpha", "luminance"]),
    choice("direction", "up", ["up", "down"]),
    number("size", 6, 0.25, 128, 0.25, "px"),
    number("softness", 0.5, 0, 1),
    number("depth", 4, 0, 32, 0.1),
    number("azimuth", 135, 0, 360, 1, "°"),
    number("altitude", 35, 1, 89, 1, "°"),
    number("ambient", 0.55, 0, 1),
    number("highlight", 0.8, 0, 2),
    number("shadow", 0.65, 0, 2),
    number("gloss", 8, 1, 64, 1),
    color("highlightColor", "#ffffff"),
    color("shadowColor", "#201729"),
  ],
  "effect",
  "preserve",
  { identityAtZero: true },
);
