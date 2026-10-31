import {
  AMOUNT,
  SCALE,
  COLOR,
  defineEffect,
  type EffectParameter,
  type NumberEffectParameter,
} from "../definition";
export const ASCII_DEFAULT_CHARACTERS = " .,:;+tfLCG08M@#";
const number = (
  key: string,
  value: number,
  min: number,
  max: number,
  step = 0.01,
  displayScale = 1,
  unit = "",
): NumberEffectParameter => ({
  kind: "number",
  scope: "settings",
  key,
  default: value,
  min,
  max,
  step,
  displayScale,
  unit,
  labelKey: `asciiFx:parameter.${key}`,
});
export const ASCII_PARAMETERS: readonly EffectParameter[] = [
  AMOUNT,
  { ...SCALE, labelKey: "asciiFx:parameter.scale" },
  {
    kind: "text",
    scope: "settings",
    key: "characters",
    default: ASCII_DEFAULT_CHARACTERS,
    minLength: 1,
    maxLength: 64,
    labelKey: "asciiFx:parameter.characters",
    descriptionKey: "asciiFx:charactersHint",
  },
  number("brightness", 0, -1, 1, 0.01, 100, "%"),
  number("contrast", 1, 0, 4, 0.05, 1, "×"),
  number("gamma", 1, 0.1, 4, 0.05, 1, "×"),
  {
    kind: "select",
    scope: "settings",
    key: "palette",
    default: "image",
    labelKey: "asciiFx:parameter.palette",
    options: ["image", "tonal", "solid"].map((value) => ({
      value,
      labelKey: `asciiFx:palette.${value}`,
    })),
  },
  ...(["foreground", "background"] as const).map((key): EffectParameter => ({
    kind: "color",
    scope: "settings",
    key,
    default: key === "foreground" ? "#ffffff" : "#000000",
    labelKey: `asciiFx:parameter.${key}`,
  })),
  { ...number("shades", 16, 2, 64, 1), integer: true },
  {
    kind: "boolean",
    scope: "settings",
    key: "invert",
    default: false,
    labelKey: "asciiFx:parameter.invert",
  },
  number("cellAspect", 0.65, 0.25, 1.5, 0.01, 1, "×"),
  number("glyphScale", 1, 0.5, 1.5, 0.01, 100, "%"),
  number("weight", 0.5, 0, 1, 0.01, 100, "%"),
  {
    ...COLOR,
    labelKey: "asciiFx:parameter.color",
    visibleWhen: { key: "palette", values: ["image"] },
  },
];
export const ASCII_DEFAULT_SETTINGS = Object.freeze(
  Object.fromEntries(
    ASCII_PARAMETERS.filter((p) => p.scope === "settings").map((p) => [p.key, p.default]),
  ),
);
/** Identity tonal defaults preserve existing ASCII documents, including their Color animation. */
export const ASCII_DEFINITION = Object.freeze({
  ...defineEffect(
    "ascii",
    { scale: 10, levels: 10, color: true, settings: ASCII_DEFAULT_SETTINGS },
    ASCII_PARAMETERS,
  ),
  nameKey: "asciiFx:name",
});
