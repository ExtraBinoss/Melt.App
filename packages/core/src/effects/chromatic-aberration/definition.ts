import { AMOUNT, defineEffect } from "../definition";
import { effectFields } from "../shared/fields";

const f = effectFields("chromatic-aberrationFx");

export const CHROMATIC_ABERRATION_DEFINITION = defineEffect(
  "chromatic-aberration",
  {},
  [
    AMOUNT,
    f.choice("mode", "radial", ["radial", "directional"]),
    { ...f.number("centerX", 0.5, 0, 1, 0.001, "%"), displayScale: 100 },
    { ...f.number("centerY", 0.5, 0, 1, 0.001, "%"), displayScale: 100 },
    f.number("angle", 0, -180, 180, 1, "°"),
    f.number("separation", 8, 0, 128, 0.1, "px"),
    f.number("radius", 480, 1, 8192, 1, "px"),
    f.number("falloff", 1, 0, 4),
  ],
  "effect",
  "preserve",
  { sdk: { direction: "angle", preferredTargets: ["separation", "angle", "centerX"] } },
);
