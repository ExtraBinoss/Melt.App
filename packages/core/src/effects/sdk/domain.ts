import type { EffectDefinition, EffectParameter, NumberEffectParameter } from "../definition";
import { BUILTIN_EFFECT_PREVIEWS } from "./preview";

const field = (
  key: string,
  value: number,
  min: number,
  max: number,
  step: number,
  unit = "",
): NumberEffectParameter => ({
  kind: "number",
  scope: "settings",
  key,
  default: value,
  min,
  max,
  step,
  labelKey: `effectDomain:${key}`,
  displayScale: unit === "%" ? 100 : 1,
  unit,
});
/** Owner-local coordinates, independent of viewport density and expanded transport margins. */
export const EFFECT_DOMAIN_PARAMETERS: readonly EffectParameter[] = Object.freeze([
  {
    kind: "boolean",
    scope: "settings",
    key: "domainEnabled",
    default: false,
    labelKey: "effectDomain:domainEnabled",
  },
  field("domainX", 0.5, -2, 3, 0.001, "%"),
  field("domainY", 0.5, -2, 3, 0.001, "%"),
  field("domainAngle", 0, -180, 180, 1, "°"),
  field("domainRadius", 0.5, 0.001, 4, 0.001, "%"),
  field("domainAspect", 1, 0.05, 20, 0.01, "×"),
  field("domainFeather", 0.2, 0, 1, 0.01, "%"),
]);
export const EFFECT_DOMAIN_KEYS = Object.freeze(EFFECT_DOMAIN_PARAMETERS.map((p) => p.key));
export function withEffectSdk(definition: EffectDefinition): EffectDefinition {
  const preview = definition.sdk?.preview ?? BUILTIN_EFFECT_PREVIEWS[definition.type];
  if (definition.retired || definition.source === "geometry") {
    return Object.freeze({
      ...definition,
      sdk: Object.freeze({ ...definition.sdk, preview }),
    });
  }
  const spatial = definition.sdk?.placement !== false;
  const gizmo: EffectDefinition["gizmo"] =
    definition.gizmo ??
    (spatial
      ? {
          kind: "radial",
          enabled: "domainEnabled",
          centerX: "domainX",
          centerY: "domainY",
          radius: "domainRadius",
          radiusUnits: "relative-min",
          aspect: "domainAspect",
          rotation: "domainAngle",
        }
      : undefined);
  return Object.freeze({
    ...definition,
    sdk: Object.freeze({
      placement: spatial,
      preferredTargets: definition.parameters
        .filter((p) => p.kind === "number" || p.kind === "color")
        .slice(0, 3)
        .map((p) => p.key),
      ...definition.sdk,
      preview,
    }),
    ...(gizmo ? { gizmo } : {}),
    parameters: spatial
      ? Object.freeze([...definition.parameters, ...EFFECT_DOMAIN_PARAMETERS])
      : definition.parameters,
  });
}
