import { AMOUNT, defineEffect } from "../definition";
import { effectFields } from "../shared/fields";
const f = effectFields("edge-detectFx");
export const EDGE_DETECT_DEFINITION = defineEffect(
  "edge-detect",
  {},
  [
    AMOUNT,
    f.choice("method", "scharr", ["scharr", "sobel", "prewitt", "roberts", "laplacian", "dog"]),
    f.choice("source", "luminance", ["luminance", "alpha"]),
    f.number("smoothing", 0.75, 0, 8, 0.25, "px"),
    f.number("width", 1, 0.25, 8, 0.25, "px"),
    f.number("gain", 2, 0.1, 8),
    f.number("threshold", 0.12, 0, 1),
    f.number("softness", 0.15, 0.001, 1),
    f.boolean("invert", false),
    f.boolean("overlay", false),
    f.number("backgroundOpacity", 1, 0, 1),
    f.color("foregroundColor", "#ffffff"),
    f.color("backgroundColor", "#111111"),
  ],
  "effect",
  "reduce",
  { identityAtZero: true },
);
