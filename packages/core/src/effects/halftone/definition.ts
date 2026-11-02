import { AMOUNT, SCALE, COLOR, defineEffect, type EffectParameter } from "../definition";
import { effectFields } from "../shared/fields";
const f = effectFields("halftoneFx");
function visibility(parameter: EffectParameter): EffectParameter {
  if (
    ["amount", "scale", "pattern", "color", "cyanAngle", "magentaAngle", "yellowAngle"].includes(
      parameter.key,
    )
  )
    return parameter;
  return {
    ...parameter,
    visibleWhen: {
      key: "pattern",
      values:
        parameter.key === "ink"
          ? ["circle-grid"]
          : ["paper", "backgroundOpacity"].includes(parameter.key)
            ? ["circle-grid", "round-mosaic"]
            : ["circle-grid", "round-mosaic", "color-screen"],
    },
  };
}
export const HALFTONE_DEFINITION = defineEffect(
  "halftone",
  { scale: 8 },
  [
    AMOUNT,
    f.choice("pattern", "legacy", ["legacy", "circle-grid", "round-mosaic", "color-screen"]),
    SCALE,
    {
      ...COLOR,
      labelKey: "halftoneFx:parameter.sourceColor",
      visibleWhen: { key: "pattern", values: ["legacy", "circle-grid"] },
    },
    ...(["cyanAngle", "magentaAngle", "yellowAngle"] as const).map((key, i) => ({
      ...f.number(key, [108, 162, 90][i]!, -180, 180, 1, "°"),
      visibleWhen: { key: "pattern", values: ["color-screen"] },
    })),
    f.number("rotation", 0, -180, 180, 1, "°"),
    f.number("dotSize", 0.9, 0, 1),
    f.number("softness", 0.5, 0, 8, 0.1, "px"),
    f.number("gamma", 1, 0.1, 4),
    f.number("offsetX", 0, -256, 256, 0.5, "px"),
    f.number("offsetY", 0, -256, 256, 0.5, "px"),
    f.color("ink", "#141414"),
    f.color("paper", "#ffffff"),
    f.number("backgroundOpacity", 1, 0, 1),
  ].map(visibility),
  "effect",
  "reduce",
);
