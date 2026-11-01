import { scenePropertyLabel } from "../scene/presentation";
import { spatialPropertyLabel } from "../../spatial/presentation";
import {
  getEffectDefinition,
  type AnimationChannel,
  type AnimationTarget,
  type SceneAnimationTarget,
  type MotionAnimationPreset,
} from "@musart/core";
import type { TFunction } from "i18next";

const layerLabels: Record<string, string> = {
  x: "horizontalMove",
  y: "verticalMove",
  scaleX: "horizontalScale",
  scaleY: "verticalScale",
};
const motionLabels: Record<string, string> = {
  "fillGradient.angle": "gradientAngle",
  "fillGradient.kind": "gradientKind",
};
const pixelProperties = new Set([
  "x",
  "y",
  "width",
  "height",
  "strokeWidth",
  "radius",
  "fontSize",
  "letterSpacing",
]);

/** Presentation units convert back to the original portable values before every command. */
export function channelPresentation(
  channel: AnimationChannel<AnimationTarget | SceneAnimationTarget>,
  preset: MotionAnimationPreset<AnimationTarget | SceneAnimationTarget>,
  t: TFunction,
) {
  const target = channel.target;
  const property = target.property;
  const effect =
    target.kind === "effect" || target.kind === "effectSetting"
      ? preset.effects[target.slot]
      : undefined;
  const definition = effect && getEffectDefinition(effect.type);
  const parameter = definition?.parameters.find(
    (item) =>
      item.key === property && (item.scope === "settings") === (target.kind === "effectSetting"),
  );
  const name =
    target.kind === "camera" || target.kind === "environment" || target.kind === "light"
      ? scenePropertyLabel(target, t)
      : target.kind === "layer"
        ? property.startsWith("spatial.")
          ? spatialPropertyLabel(property, t)
          : layerLabels[property]
            ? t(layerLabels[property], { ns: "animations" })
            : t(motionLabels[property] ?? property, { ns: "motion" })
        : `${definition ? t(definition.nameKey, { ns: "translation" }) : t("effect", { ns: "animations" })} · ${parameter ? t(parameter.labelKey, { ns: "translation" }) : t(property, { ns: "motion", defaultValue: property })}`;
  const percent =
    !!channel.unit ||
    ["scaleX", "scaleY", "opacity"].includes(property) ||
    (target.kind === "effect" && property === "amount") ||
    (target.kind === "effectSetting" && property === "progress");
  const factor = percent ? 100 : 1;
  const unit = percent
    ? "%"
    : ["yaw", "pitch", "fov", "angle"].includes(property) ||
        property === "rotation" ||
        property === "fillGradient.angle" ||
        property.startsWith("spatial.rotation")
      ? "°"
      : target.kind === "layer" && pixelProperties.has(property)
        ? "px"
        : undefined;
  const hint = channel.unit
    ? t(`relative.${channel.unit}`, { ns: "animations" })
    : (property === "scaleX" || property === "scaleY") && channel.operation !== "add"
      ? t("scaleHint", { ns: "animations" })
      : t(`operation.${channel.operation}`, { ns: "animations" });
  return { name, factor, unit, hint };
}
