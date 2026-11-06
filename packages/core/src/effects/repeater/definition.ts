import { AMOUNT, defineEffect } from "../definition";
import { effectFields } from "../shared/fields";

const f = effectFields("repeaterFx");
/** Includes the original. A finite graph keeps work bounded on WebGPU and WebGL. */
export const REPEATER_MAX_COPIES = 16;
export const REPEATER_DEFINITION = defineEffect(
  "repeater",
  {},
  [
    AMOUNT,
    f.choice("layout", "linear", ["linear", "grid", "radial"]),
    { ...f.number("count", 4, 1, REPEATER_MAX_COPIES, 1), integer: true },
    {
      ...f.number("columns", 3, 1, REPEATER_MAX_COPIES, 1),
      integer: true,
      visibleWhen: { key: "layout", values: ["grid"] },
    },
    {
      ...f.number("spacingX", 100, -1024, 1024, 1, "px"),
      visibleWhen: { key: "layout", values: ["linear", "grid"] },
    },
    {
      ...f.number("spacingY", 100, -1024, 1024, 1, "px"),
      visibleWhen: { key: "layout", values: ["grid"] },
    },
    {
      ...f.number("radius", 160, 0, 4096, 1, "px"),
      visibleWhen: { key: "layout", values: ["radial"] },
    },
    f.number("angle", 0, -180, 180, 1, "°"),
    { ...f.number("scaleStep", -0.08, -0.1, 0.25, 0.001, "%"), displayScale: 100 },
    f.number("rotationStep", 0, -180, 180, 1, "°"),
    { ...f.number("copyOpacity", 0.8, 0, 1, 0.01, "%"), displayScale: 100 },
  ],
  "effect",
  "expand",
  {
    identityAtZero: true,
    sdk: { direction: "angle", preferredTargets: ["spacingX", "angle", "rotationStep"] },
  },
);
