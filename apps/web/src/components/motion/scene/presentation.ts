import type { TFunction } from "i18next";
import type { SceneAnimationTarget, SceneMotionPropertyTarget } from "@musart/core";
import type { SceneTimelineRow } from "./tree";
import "../../spatial/messages";
export function scenePropertyLabel(
  target: SceneAnimationTarget | SceneMotionPropertyTarget,
  t: TFunction,
): string {
  const property = target.property;
  if (property === "x" || property === "y" || property === "z")
    return t("positionAxis", { ns: "spatial", axis: property.toUpperCase() });
  if (property.startsWith("target"))
    return t("targetAxis", { ns: "spatial", axis: property.slice(-1) });
  return t(property === "type" && target.kind === "light" ? "lightType" : property, {
    ns: "spatial",
  });
}
export function sceneRowName(row: SceneTimelineRow, t: TFunction): string {
  return row.subject === "light"
    ? `${t(`lightTypes.${row.lightType}`, { ns: "spatial" })} ${(row.lightIndex ?? 0) + 1}`
    : t(row.subject, { ns: "spatial" });
}
