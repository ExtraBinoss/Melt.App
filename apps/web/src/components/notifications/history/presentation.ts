import {
  getHistoryPropertyDefinition,
  getBlendDefinition,
  type BlendMode,
  type HistoryChange,
  type HistoryDescription,
  type HistoryOwner,
  type HistoryPropertyDefinition,
  type HistoryValue,
} from "@musart/core";
import type { TFunction } from "i18next";
import { historyPropertyLabel } from "./property-label";
import type { HistoryOwnerNames } from "./owners";
export { historyPropertyLabel } from "./property-label";

function choiceLabel(value: string, definition: HistoryPropertyDefinition, t: TFunction): string {
  const explicit = definition.choiceLabels?.find((option) => option.value === value);
  if (explicit) return t(explicit.labelKey, { ns: "translation" });
  const { source, property } = definition.label;
  if (property === "fillGradient.kind" || property === "backgroundGradient.kind")
    return t(value, { ns: "gradient" });
  if (property === "textAlign") {
    const keys: Readonly<Record<string, string>> = {
      left: "alignLeft",
      center: "alignCenter",
      right: "alignRight",
    };
    return t(keys[value] ?? value, { ns: "translation" });
  }
  if (property === "blendMode")
    return t(getBlendDefinition(value as BlendMode).nameKey, { ns: "translation" });
  if (property === "composite") return t(`operation.${value}`, { ns: "effectControls" });
  if (source === "spatial" && property === "material.preset")
    return t(`materialNames.${value}`, { ns: "spatial", defaultValue: value });
  if (source === "scene" && property === "type") return t(`lightTypes.${value}`, { ns: "spatial" });
  if (property === "projection") return t(value, { ns: "spatial" });
  if (property === "reflections.mode") return t(`${value}Reflections`, { ns: "spatial" });
  if (property === "reflections.quality")
    return t(`reflectionQualities.${value}`, { ns: "spatial" });
  if (property === "preset" && source === "scene")
    return t(`environments.${value}`, { ns: "spatial", defaultValue: value });
  if (property === "easing")
    return t(
      value === "cubicBezier" ? "customBezier" : value === "spring" ? "customSpring" : value,
      { ns: "motionEasing" },
    );
  if (property === "mode" && source === "motion") return t(value, { ns: "motion" });
  if (source === "guide" && property === "axis") return value.toUpperCase();
  if (source === "mask" && property === "mode") return t(value, { ns: "historyNotice" });
  // Portable color-space identifiers are established technical names.
  return value;
}
function displayNumber(value: number, scale: number): number {
  // Decimal exponent shifting avoids turning 0.57 into 56.99999999999999%.
  const power = Math.log10(scale);
  if (!Number.isInteger(power)) return value * scale;
  const [coefficient, exponent = "0"] = String(value).split("e");
  return Number(`${coefficient}e${Number(exponent) + power}`);
}
function propertyValue(
  value: HistoryValue,
  definition: HistoryPropertyDefinition,
  t: TFunction,
): string {
  if (value.kind !== "scalar") return t(value.kind, { ns: "historyNotice" });
  const { property } = definition.label;
  if (definition.label.scope === "input" || ["assetId", "parentId", "layerId"].includes(property))
    return t("assigned", { ns: "historyNotice" });
  if (typeof value.value === "boolean")
    return t(value.value ? "on" : "off", { ns: "historyNotice" });
  if (typeof value.value === "number")
    return `${displayNumber(value.value, definition.displayScale ?? 1)}${definition.unit ?? ""}`;
  const semanticChoice =
    definition.kind === "choice" ||
    (definition.label.source === "scene" && property === "preset") ||
    (definition.label.source === "spatial" && property === "material.preset");
  let text = semanticChoice ? choiceLabel(value.value, definition, t) : value.value;
  if (definition.label.source === "spatial" && property === "source")
    text =
      value.value === "glb"
        ? "GLB"
        : value.value === "group"
          ? t("group", { ns: "translation" })
          : t(`primitives.${value.value}`, { ns: "spatial" });
  return `${text || t("empty", { ns: "historyNotice" })}${value.truncated ? "…" : ""}`;
}
function ownerLabel(owner: HistoryOwner, t: TFunction): string {
  if (owner.kind === "effect") return t(owner.effectType, { ns: "translation" });
  return t(owner.kind === "motion" ? owner.entity : owner.kind, { ns: "historyNotice" });
}
function changeLabel(
  change: HistoryChange,
  direction: "undo" | "redo",
  t: TFunction,
  name?: string,
): string | null {
  if (change.kind === "action") {
    const label = t(change.action, { ns: "historyNotice" });
    if (name)
      return change.owner.kind === "effect"
        ? `${label} ${ownerLabel(change.owner, t)} · ${name}`
        : `${label} ${name}`;
    return [
      "geometry",
      "spatialTransform",
      "gradientStops",
      "applyTransition",
      "animationChannels",
      "assets",
      "replay",
    ].includes(change.action)
      ? change.owner.kind === "effect"
        ? `${ownerLabel(change.owner, t)} · ${label}`
        : label
      : `${label} · ${ownerLabel(change.owner, t)}`;
  }
  const definition = getHistoryPropertyDefinition(change.target);
  if (!definition) return null;
  const owner = change.target.owner,
    prefix = ["camera", "environment", "light", "audio", "guide", "mask", "motion"].includes(
      owner.kind,
    )
      ? `${ownerLabel(owner, t)} · `
      : "",
    context = change.context ? `${t(change.context, { ns: "historyNotice" })} · ` : "";
  const label = `${prefix}${context}${historyPropertyLabel(definition, t)} ${propertyValue(direction === "undo" ? change.before : change.after, definition, t)}`;
  return name ? `${t("change", { ns: "historyNotice" })} ${label} · ${name}` : label;
}

/** Authoritative retained semantics only: no engine, current page, selection or document reads. */
export function formatHistoryDescription(
  description: HistoryDescription | undefined,
  direction: "undo" | "redo",
  t: TFunction,
  owners?: HistoryOwnerNames,
): string {
  let named: string | null = null;
  for (const [index, change] of (description?.changes ?? []).entries()) {
    named = changeLabel(change, direction, t, owners?.[index]);
    if (named !== null) break;
  }
  const label = named ?? t("edit", { ns: "historyNotice" });
  if (!description) return label;
  if (description.additionalChanges) return `${label} · ${t("overflow", { ns: "historyNotice" })}`;
  const count = Math.max(0, description.changes.length - 1);
  return count ? `${label} · ${t("more", { ns: "historyNotice", count })}` : label;
}
