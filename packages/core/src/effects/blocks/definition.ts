import { AMOUNT, SCALE, SEED, defineEffect } from "../definition";
import { effectFields } from "../shared/fields";

const f = effectFields("blocksFx");

/** A source-image brick mosaic; unrelated to the Gradient Blocks treatment. */
export const BLOCKS_DEFINITION = defineEffect(
  "blocks",
  { scale: 24 },
  [
    AMOUNT,
    { ...SCALE, labelKey: "blocksFx:parameter.scale", max: 256 },
    { ...f.number("centerX", 0.5, 0, 1, 0.001, "%"), displayScale: 100 },
    { ...f.number("centerY", 0.5, 0, 1, 0.001, "%"), displayScale: 100 },
    f.number("angle", 0, -180, 180, 1, "°"),
    f.boolean("stagger", true),
    f.number("gap", 1, 0, 12, 0.1, "px"),
    f.number("relief", 0.8, 0, 1),
    f.number("studRadius", 0.265, 0.12, 0.42, 0.005),
    f.number("studHeight", 1, 0, 2),
    { ...f.number("paletteLevels", 0, 0, 16, 1), integer: true },
    f.number("lightAngle", -135, -180, 180, 1, "°"),
    f.number("variation", 0.04, 0, 0.25),
    SEED,
  ],
  "effect",
  "reduce",
  { sdk: { direction: "angle", preferredTargets: ["scale", "angle", "relief"] } },
);
