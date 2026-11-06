import { AMOUNT, defineEffect } from "../definition";
import { GLOW_DEFAULT_SETTINGS, glowFields } from "../glow/definition";
import { effectFields } from "../shared/fields";

export const NEON_MELT_PALETTES = Object.freeze(["acid", "spectral", "ultraviolet"] as const);
export const NEON_MELT_DEFAULT_SETTINGS = Object.freeze({
  ...GLOW_DEFAULT_SETTINGS,
  threshold: 0.35,
  intensity: 0.9,
  radius: 24,
  palette: "acid",
  paletteShift: 0,
  contrast: 1.2,
  distortion: 18,
  liquidScale: 96,
  direction: 0,
  phase: 0,
});
const field = effectFields("neon-meltFx");
export const NEON_MELT_DEFINITION = Object.freeze({
  ...defineEffect(
    "neon-melt",
    { settings: NEON_MELT_DEFAULT_SETTINGS },
    [
      AMOUNT,
      field.choice("palette", "acid", NEON_MELT_PALETTES),
      field.number("paletteShift", 0, -1, 1),
      field.number("contrast", 1.2, 0.1, 4),
      field.number("distortion", 18, 0, 96, 0.5, "px"),
      field.number("liquidScale", 96, 8, 512, 1, "px"),
      field.number("direction", 0, -180, 180, 1, "°"),
      field.number("phase", 0, -100, 100),
      ...glowFields("neon-meltFx", NEON_MELT_DEFAULT_SETTINGS),
    ],
    "effect",
    "expand",
    {
      identityAtZero: true,
      sdk: { direction: "direction", preferredTargets: ["phase", "distortion", "paletteShift"] },
    },
  ),
  nameKey: "neon-meltFx:name",
});
