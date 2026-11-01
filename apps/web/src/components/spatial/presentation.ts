import type { TFunction } from "i18next";
import type { MotionAnimationPreset } from "@musart/core";
import "./messages";
export function spatialPropertyLabel(property: string, t: TFunction): string {
  const key = property.slice("spatial.".length);
  const options = { ns: "spatial" };
  if (["x", "y", "z"].includes(key))
    return t("positionAxis", { ...options, axis: key.toUpperCase() });
  if (key.startsWith("rotation")) return t("rotationAxis", { ...options, axis: key.slice(-1) });
  if (key.startsWith("scale")) return t("scaleAxis", { ...options, axis: key.slice(-1) });
  return t(key.replace("material.", ""), options);
}
export function animationPresetName(
  preset: Pick<MotionAnimationPreset, "id" | "name">,
  t: TFunction,
): string {
  if (/^scene-(camera-orbit|camera-push|light-pulse|environment-turn)$/.test(preset.id))
    return t(`sceneAnimationNames.${preset.id.slice(6)}`, { ns: "spatial" });
  return /^spatial-(spin|turn|tumble|rock|float|grow|extrude)$/.test(preset.id)
    ? t(`animationNames.${preset.id.slice(8)}`, { ns: "spatial" })
    : preset.name;
}
