import { AMOUNT, defineEffect, type EffectParameter } from "../definition";
import { effectFields } from "../shared/fields";

const f = effectFields("shape-gridFx");
const palette = (parameter: EffectParameter): EffectParameter => ({
  ...parameter,
  visibleWhen: { key: "colorMode", values: ["palette"] },
});

export const SHAPE_GRID_DEFINITION = Object.freeze({
  ...defineEffect(
    "shape-grid",
    {},
    [
      AMOUNT,
      f.choice("shape", "adaptive", [
        "adaptive",
        "dots",
        "rings",
        "diamonds",
        "squares",
        "crosses",
      ]),
      f.number("cellSize", 12, 3, 128, 0.5, "px"),
      f.number("fill", 1, 0, 1),
      f.number("stroke", 0.8, 0, 8, 0.1, "px"),
      f.number("rotation", 0, -180, 180, 1, "°"),
      f.number("contrast", 1, 0.1, 3),
      f.choice("colorMode", "source", ["source", "palette"]),
      palette(f.color("shadowColor", "#192e49")),
      palette(f.color("midtoneColor", "#df7850")),
      palette(f.color("highlightColor", "#f2cf86")),
      f.color("backgroundColor", "#faf5eb"),
      f.number("backgroundOpacity", 0, 0, 1),
    ],
    "effect",
    "reduce",
    {
      identityAtZero: true,
      sdk: { direction: "rotation", preferredTargets: ["cellSize", "rotation", "fill"] },
    },
  ),
  nameKey: "shape-gridFx:name",
});
