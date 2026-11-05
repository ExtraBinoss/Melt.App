import { AMOUNT, defineEffect } from "../definition";
import { effectFields } from "../shared/fields";

const f = effectFields("trailFx");

export const TRAIL_MAX_ECHOES = 8;

export const TRAIL_DEFINITION = defineEffect(
  "trail",
  {},
  [
    AMOUNT,
    f.choice("mode", "temporal", ["temporal", "offset"]),
    { ...f.number("echoCount", 4, 1, TRAIL_MAX_ECHOES, 1), integer: true },
    {
      ...f.number("delay", 0.08, 0.001, 5, 0.001, "s"),
      visibleWhen: { key: "mode", values: ["temporal"] },
    },
    f.number("fade", 0.65, 0, 1),
    f.number("offsetX", 0, -512, 512, 0.5, "px"),
    f.number("offsetY", 0, -512, 512, 0.5, "px"),
    f.number("angle", 0, -180, 180, 1, "°"),
    { ...f.number("centerX", 0.5, 0, 1, 0.001, "%"), displayScale: 100 },
    { ...f.number("centerY", 0.5, 0, 1, 0.001, "%"), displayScale: 100 },
    f.number("spread", 0, -0.25, 0.25, 0.001),
  ],
  "effect",
  "expand",
  {
    requirements: { history: true, scope: "composition" },
    sdk: { direction: "angle", preferredTargets: ["fade", "offsetX", "spread"] },
  },
);
