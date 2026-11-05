import { AMOUNT, defineEffect } from "../definition";
import { effectFields } from "../shared/fields";

const f = effectFields("depth-of-fieldFx");

/** Manual focus uses actual camera distance; cropped viewports cannot resolve arbitrary focus points. */
export const DEPTH_OF_FIELD_DEFINITION = defineEffect(
  "depth-of-field",
  {},
  [
    AMOUNT,
    f.number("focusDistance", 8, 0.01, 5000, 0.01),
    f.number("focusRange", 0.15, 0, 100, 0.01),
    f.number("aperture", 2.8, 0.7, 32, 0.1, "f/"),
    f.number("maxBlur", 16, 0, 48, 0.25, "px"),
    { ...f.number("blades", 6, 3, 9, 1), integer: true },
    f.number("angle", 0, -180, 180, 1, "°"),
    f.number("edgeProtection", 0.7, 0, 1),
    f.choice("quality", "high", ["low", "medium", "high"]),
  ],
  "effect",
  "preserve",
  {
    requirements: { depth: true, scope: "composition" },
    sdk: { direction: "angle", preferredTargets: ["focusDistance", "aperture", "maxBlur"] },
  },
);
