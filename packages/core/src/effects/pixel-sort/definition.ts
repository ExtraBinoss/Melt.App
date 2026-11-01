import { AMOUNT, defineEffect } from "../definition";
import { effectFields } from "../shared/fields";
const f = effectFields("pixel-sortFx");
export const PIXEL_SORT_DEFINITION = defineEffect(
  "pixel-sort",
  {},
  [
    AMOUNT,
    f.choice("axis", "horizontal", ["horizontal", "vertical"]),
    f.choice("order", "ascending", ["ascending", "descending"]),
    f.choice("metric", "luminance", ["luminance", "red", "green", "blue"]),
    f.choice("window", "32", ["8", "16", "32", "64"]),
    f.number("cellSize", 1, 1, 16, 1, "px"),
    f.number("offset", 0, 0, 1),
  ],
  "effect",
  "expand",
  { identityAtZero: true },
);
