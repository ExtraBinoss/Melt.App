import { AMOUNT, defineEffect } from "../definition";
import { effectFields } from "../shared/fields";

const f = effectFields("wave-distortionFx");
export const WAVE_DISTORTION_DEFINITION = defineEffect(
  "wave-distortion",
  {},
  [
    AMOUNT,
    f.choice("waveform", "sine", ["sine", "triangle", "square", "sawtooth"]),
    f.number("amplitude", 24, 0, 1024, 0.5, "px"),
    f.number("frequency", 4, 0.05, 64, 0.05),
    f.number("angle", 0, -180, 180, 1, "°"),
    f.number("phase", 0, -360, 360, 1, "°"),
    f.choice("edge", "transparent", ["transparent", "mirror", "repeat", "clamp"]),
  ],
  "effect",
  "expand",
  {
    identityAtZero: true,
    sdk: { direction: "angle", preferredTargets: ["phase", "amplitude", "frequency"] },
  },
);
