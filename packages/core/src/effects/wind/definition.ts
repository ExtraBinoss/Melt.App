import { AMOUNT, SEED, defineEffect } from "../definition";
import { effectFields } from "../shared/fields";

const f = effectFields("windFx");

export const WIND_DEFINITION = defineEffect(
  "wind",
  { time: 0 },
  [
    AMOUNT,
    { ...f.number("centerX", 0.5, 0, 1, 0.001, "%"), displayScale: 100 },
    { ...f.number("centerY", 0.5, 0, 1, 0.001, "%"), displayScale: 100 },
    f.number("angle", 0, -180, 180, 1, "°"),
    f.number("length", 72, 0, 512, 0.5, "px"),
    f.number("bandSize", 8, 1, 128, 0.5, "px"),
    f.number("variation", 0.7, 0, 1),
    f.number("gust", 0.35, 0, 1),
    f.number("speed", 0.25, 0, 4, 0.01, "Hz"),
    f.number("phase", 0, 0, 360, 1, "°"),
    f.number("sourceMix", 0.25, 0, 1),
    SEED,
    {
      kind: "number",
      key: "time",
      labelKey: "windFx:parameter.time",
      min: 0,
      max: 86400,
      step: 0.01,
      displayScale: 1,
      unit: "s",
    },
  ],
  "effect",
  "preserve",
  { sdk: { direction: "angle", preferredTargets: ["phase", "angle", "length"] } },
);
