import { AMOUNT, defineEffect } from "../definition";
import { effectFields } from "../shared/fields";

export const GLOW_DEFAULT_SETTINGS = Object.freeze({
  threshold: 0.65,
  knee: 0.2,
  intensity: 1.4,
  radius: 32,
  tint: "#ffffff",
  glowOnly: false,
});

/** Shared bloom controls keep the composite Neon Melt authorable through the SDK. */
export function glowFields(
  namespace: string,
  defaults: {
    threshold: number;
    knee: number;
    intensity: number;
    radius: number;
    tint: string;
    glowOnly: boolean;
  } = GLOW_DEFAULT_SETTINGS,
) {
  const field = effectFields(namespace);
  return [
    field.number("threshold", defaults.threshold, 0, 1),
    field.number("knee", defaults.knee, 0, 1),
    field.number("intensity", defaults.intensity, 0, 6),
    field.number("radius", defaults.radius, 0, 256, 1, "px"),
    field.color("tint", defaults.tint),
    field.boolean("glowOnly", defaults.glowOnly),
  ];
}

export const GLOW_DEFINITION = Object.freeze({
  ...defineEffect(
    "glow",
    { settings: GLOW_DEFAULT_SETTINGS },
    [AMOUNT, ...glowFields("glowFx")],
    "effect",
    "expand",
    { identityAtZero: true, sdk: { preferredTargets: ["intensity", "radius", "threshold"] } },
  ),
  nameKey: "glowFx:name",
});
