import { getEffectDefinition, type Layer, type MotionPropertyTarget } from "@musart/core";
import type { TFunction } from "i18next";
import { spatialPropertyLabel } from "../../spatial/presentation";

const labels: Readonly<Record<string, string>> = {
  x: "positionX",
  y: "positionY",
  "fillGradient.angle": "gradientAngle",
  "fillGradient.kind": "gradientKind",
};

/** Human property names stay identical in direct channels and both timeline views. */
export function motionPropertyLabel(
  target: MotionPropertyTarget,
  layer: Layer,
  motion: TFunction,
  common: TFunction,
) {
  if (target.kind === "layer")
    return target.property.startsWith("spatial.")
      ? spatialPropertyLabel(target.property, motion)
      : motion(labels[target.property] ?? target.property);
  const effect = layer.effects.find((item) => item.id === target.effectId);
  if (!effect) return target.property;
  const definition = getEffectDefinition(effect.type);
  const parameter = definition.parameters.find(
    (item) =>
      item.key === target.property &&
      (item.scope === "settings") === (target.kind === "effectSetting"),
  );
  return `${common(definition.nameKey)} · ${parameter ? common(parameter.labelKey) : motion(target.property)}`;
}
