import { AMOUNT, SEED, defineEffect } from "../definition";
import { effectFields } from "../shared/fields";

const f = effectFields("risographFx");

export const RISOGRAPH_DEFINITION = Object.freeze({
  ...defineEffect(
    "risograph",
    {},
    [
      AMOUNT,
      f.choice("palette", "duotone", ["duotone", "tritone"]),
      f.color("inkA", "#176f84"),
      f.color("inkB", "#ed5246"),
      { ...f.color("inkC", "#f4bf38"), visibleWhen: { key: "palette", values: ["tritone"] } },
      f.color("paperColor", "#f5efdb"),
      f.number("dotSize", 4, 1, 32, 0.25, "px"),
      f.number("contrast", 1.25, 0.1, 3),
      f.number("inkDensity", 1, 0.1, 2),
      f.number("misregistration", 1.5, 0, 24, 0.25, "px"),
      f.number("grain", 0.2, 0, 1),
      f.number("paperTexture", 0.06, 0, 0.5),
      f.number("centerX", 0.5, 0, 1, 0.001),
      f.number("centerY", 0.5, 0, 1, 0.001),
      f.number("angle", 15, -180, 180, 1, "°"),
      SEED,
    ],
    "effect",
    "preserve",
    { sdk: { direction: "angle", preferredTargets: ["misregistration", "angle", "inkA"] } },
  ),
  nameKey: "risographFx:name",
});
