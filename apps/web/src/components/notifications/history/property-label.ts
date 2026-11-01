import { getEffectDefinition, type HistoryPropertyDefinition } from "@musart/core";
import type { TFunction } from "i18next";
import { spatialPropertyLabel } from "../../spatial/presentation";
import "../../motion/messages";
import "../../motion/audio/messages";
import "../../motion/animations/messages";
import "../../motion/easing/messages";
import "../../motion/transitions/messages";
import "../../properties/effects/messages";
import "../../properties/effects/gradient-messages";
import "../../properties/effects/library-messages";
import "../../properties/gradient/messages";
import "./messages";

const labels: Readonly<Record<string, string>> = {
  x: "motion:positionX",
  y: "motion:positionY",
  radius: "motion:radius",
  "fillGradient.angle": "motion:gradientAngle",
  "fillGradient.kind": "motion:gradientKind",
  color: "spatial:color",
  background: "translation:background",
  name: "translation:name",
  "reflections.mode": "spatial:reflections",
  "reflections.quality": "spatial:reflectionQuality",
  shadows: "spatial:shadows",
  gain: "motionAudio:gain",
  volume: "motionAudio:volume",
  strength: "animations:intensity",
  fadeIn: "motionAudio:fadeIn",
  fadeOut: "motionAudio:fadeOut",
  "reverb.mix": "motionAudio:reverbMix",
  "reverb.decay": "motionAudio:reverbDecay",
  easing: "motionEasing:title",
  "easing.bounce": "motionEasing:bounce",
  "easing.response": "motionEasing:response",
  preset: "translation:presetLabel",
  mode: "motion:mode",
  time: "motion:keyTime",
  duration: "transitions:duration",
  value: "motionEasing:value",
  assetId: "historyNotice:source",
  parentId: "historyNotice:parent",
  layerId: "historyNotice:source",
  enabled: "spatial:enabled",
  inverted: "historyNotice:inverted",
  "vector.preserveColors": "historyNotice:preserveColors",
  "vector.strokeOnly": "historyNotice:strokeOnly",
  "canvasPosition.x": "historyNotice:canvasPositionX",
  "canvasPosition.y": "historyNotice:canvasPositionY",
};

/** Only retained schema metadata is needed; deleted/inactive owners remain nameable. */
export function historyPropertyLabel(definition: HistoryPropertyDefinition, t: TFunction): string {
  const { source, property, effectType, key, scope } = definition.label;
  if (source === "effect" && effectType) {
    const effect = getEffectDefinition(effectType);
    if (scope === "input")
      return `${t(effect.nameKey, { ns: "translation" })} · ${t(effect.inputs?.find((input) => input.key === key)?.labelKey ?? "source", { ns: "historyNotice" })}`;
    const parameter = effect.parameters.find(
      (item) => item.key === key && (item.scope === "settings") === (scope === "settings"),
    );
    return `${t(effect.nameKey, { ns: "translation" })} · ${
      parameter
        ? t(parameter.labelKey, { ns: "translation" })
        : t(labels[property] ?? property, { ns: "motion" })
    }`;
  }
  if (source === "spatial") {
    const special: Readonly<Record<string, string>> = {
      source: "historyNotice:source",
      useModelMaterials: "spatial:originalMaterials",
      "material.preset": "translation:presetLabel",
    };
    return special[property]
      ? t(special[property]!)
      : spatialPropertyLabel(`spatial.${property}`, t);
  }
  if (/^(margin|margins|padding)\./.test(property)) {
    const [kind, side] = property.split(".");
    return `${t(kind === "padding" ? "padding" : "margin", { ns: "historyNotice" })} · ${t(side!, { ns: "historyNotice" })}`;
  }
  if (property.startsWith("affine."))
    return `${t("affine", { ns: "historyNotice" })} ${Number(property.slice(-1)) + 1}`;
  if (/^easing\.[xy][12]$/.test(property))
    return `${t("motionEasing:title")} · ${property.slice(-2).toUpperCase()}`;
  if (source === "scene") {
    if (["x", "y", "z"].includes(property))
      return t("positionAxis", { ns: "spatial", axis: property.toUpperCase() });
    if (property.startsWith("target"))
      return t("targetAxis", { ns: "spatial", axis: property.slice(-1) });
    return t(property === "type" ? "lightType" : (labels[property] ?? property), { ns: "spatial" });
  }
  if (source === "mask" && property === "mode") return t("maskMode", { ns: "historyNotice" });
  if (source === "guide" && property === "position") return t("position", { ns: "translation" });
  if (labels[property]) return t(labels[property]!);
  if (["scaleX", "scaleY"].includes(property))
    return t("scaleAxis", { ns: "spatial", axis: property.slice(-1) });
  const own = [
    "locked",
    "maskSource",
    "spatialContext",
    "colorSpace",
    "rulers",
    "axis",
    "mute",
    "sourceIn",
    "start",
    "end",
    "playbackRate",
    "loop",
  ];
  if (own.includes(property)) return t(property, { ns: "historyNotice" });
  return t(property, { ns: source === "audio" ? "motionAudio" : "motion" });
}
