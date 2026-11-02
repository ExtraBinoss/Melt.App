import { AMOUNT, SEED, defineEffect, type EffectParameter } from "../definition";
import { effectFields } from "../shared/fields";
const f = effectFields("torn-edgesFx");
function visible(parameter: EffectParameter): EffectParameter {
  const graphic = ["balance", "contrast", "smoothing", "ink", "backgroundOpacity"];
  const paper = [
    "tearWidth",
    "edgeWidth",
    "feather",
    "edgeColor",
    "sourceColor",
    "tearTop",
    "tearBottom",
    "tearLeft",
    "tearRight",
  ];
  const values = graphic.includes(parameter.key)
    ? ["graphic"]
    : paper.includes(parameter.key)
      ? ["paper"]
      : null;
  return values ? { ...parameter, visibleWhen: { key: "technique", values } } : parameter;
}
export const TORN_EDGES_DEFINITION = defineEffect(
  "torn-edges",
  {},
  [
    AMOUNT,
    f.choice("technique", "graphic", ["graphic", "paper"]),
    f.number("balance", 0.5, 0, 1),
    f.number("contrast", 1.5, 0.1, 8),
    f.number("roughness", 0.35, 0, 1),
    f.number("textureScale", 12, 1, 256, 0.5, "px"),
    f.number("detail", 0.5, 0, 1),
    f.number("smoothing", 1, 0, 16, 0.25, "px"),
    f.number("tearWidth", 16, 0, 512, 0.5, "px"),
    f.number("edgeWidth", 2, 0, 32, 0.25, "px"),
    f.number("feather", 0.75, 0.05, 16, 0.05, "px"),
    f.color("ink", "#171717"),
    f.color("paper", "#ffffff"),
    f.color("edgeColor", "#cbbfa4"),
    f.number("backgroundOpacity", 1, 0, 1),
    f.number("sourceColor", 0, 0, 1),
    f.boolean("tearTop", true),
    f.boolean("tearBottom", true),
    f.boolean("tearLeft", true),
    f.boolean("tearRight", true),
    SEED,
  ].map(visible),
  "effect",
  "reduce",
);
