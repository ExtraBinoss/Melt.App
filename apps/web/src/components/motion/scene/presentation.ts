import type { TFunction } from "i18next";
import {
  getEffectDefinition,
  type EffectType,
  type SceneAnimationTarget,
  type SceneMotionPropertyTarget,
} from "@musart/core";
import type { SceneTimelineRow } from "./tree";
import "../../spatial/messages";
export function scenePropertyLabel(
  target: SceneAnimationTarget | SceneMotionPropertyTarget,
  t: TFunction,
  effectType?: EffectType,
): string {
  const property = target.property;
  if (target.kind === "compositionEffect" || target.kind === "compositionEffectSetting") {
    const parameter =
      effectType &&
      getEffectDefinition(effectType).parameters.find(
        (item) =>
          item.key === property &&
          (item.scope === "settings") === (target.kind === "compositionEffectSetting"),
      );
    return parameter
      ? t(parameter.labelKey, { ns: "translation" })
      : t(property, { ns: "motion", defaultValue: property });
  }
  if (property === "x" || property === "y" || property === "z")
    return t("positionAxis", { ns: "spatial", axis: property.toUpperCase() });
  if (property.startsWith("target"))
    return t("targetAxis", { ns: "spatial", axis: property.slice(-1) });
  return t(property === "type" && target.kind === "light" ? "lightType" : property, {
    ns: "spatial",
  });
}
export function sceneRowName(row: SceneTimelineRow, t: TFunction): string {
  if (row.subject === "compositionEffect" && row.effectType)
    return t(getEffectDefinition(row.effectType).nameKey, { ns: "translation" });
  return row.subject === "light"
    ? `${t(`lightTypes.${row.lightType}`, { ns: "spatial" })} ${(row.lightIndex ?? 0) + 1}`
    : t(row.subject, { ns: "spatial" });
}
