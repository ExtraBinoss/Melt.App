import { validateMotionAnimationPreset } from "./validation";
import {
  captureAnimationRecipe,
  propertyTimelineInterval,
  normalizedPropertyPoints,
} from "./preset-utils";
import type { Composition } from "../../document/model";
import { cloneValue } from "../../document/immutable";
import { ensure } from "../../errors";
import type { MotionLayerTrack } from "../model";
import { readMotionValue } from "../properties/registry";
import type { MotionAnimation, MotionAnimationPreset, AnimationChannel } from "./model";
import { animationTarget } from "./targets";

/** Freeze the visible instance settings into a fresh library recipe, independent of its project. */
export function captureMotionAnimationPreset(
  page: Composition,
  layerId: string,
  animation: MotionAnimation,
  name: string,
  id: string,
  options: { bakeStrength?: boolean } = {},
): MotionAnimationPreset {
  const layer = page.layers.find((layer) => layer.id === layerId);
  ensure(layer, "NOT_FOUND", "Animation subject is missing");
  const preset = captureAnimationRecipe(
    animation,
    name,
    id,
    (channel) => ({
      value: readMotionValue(page, animationTarget(layerId, animation, channel.target)),
      multiplier: channel.unit ? layer[channel.unit] : 1,
    }),
    options,
  );
  preset.effects = animation.effectIds.map((effectId) => {
    const source = layer.effects.find((effect) => effect.id === effectId);
    ensure(source, "NOT_FOUND", "Animation effect is missing");
    const { id: _id, inputs: _inputs, ...definition } = cloneValue(source);
    return definition;
  });
  validateMotionAnimationPreset(preset);
  return preset;
}

/** Export any authored property timeline as a self-contained, target-relative reusable recipe. */
export function extractMotionAnimationPreset(
  page: Composition,
  track: MotionLayerTrack,
  name: string,
  id: string,
): MotionAnimationPreset {
  const layer = page.layers.find((layer) => layer.id === track.layerId);
  ensure(layer, "NOT_FOUND", "Animation subject is missing");
  const properties = track.properties.filter((property) => property.keyframes.length >= 2);
  const { first, last } = propertyTimelineInterval(properties);
  const slots = new Map<string, number>();
  const effects: MotionAnimationPreset["effects"] = [];
  const channels: AnimationChannel[] = properties.map((property) => {
    const target = property.target;
    let destination: AnimationChannel["target"];
    let operation: AnimationChannel["operation"] = "replace";
    let unit: AnimationChannel["unit"];
    const baseline = readMotionValue(page, target);
    if (target.kind === "layer") {
      destination = { kind: "layer", property: target.property };
      if (["x", "y", "rotation"].includes(target.property)) operation = "add";
      if (target.property === "scaleX" || target.property === "scaleY") operation = "multiply";
      if (target.property === "x") unit = "width";
      if (target.property === "y") unit = "height";
    } else {
      if (!slots.has(target.effectId)) {
        const original = layer.effects.find((effect) => effect.id === target.effectId)!;
        const { id: _id, inputs: _inputs, ...definition } = cloneValue(original);
        slots.set(target.effectId, effects.length);
        effects.push(definition);
      }
      destination = {
        kind: target.kind,
        slot: slots.get(target.effectId)!,
        property: target.property,
      } as AnimationChannel["target"];
    }
    const points = normalizedPropertyPoints(property.keyframes, first, last, (value) =>
      typeof value === "number" && typeof baseline === "number"
        ? operation === "add"
          ? (value - baseline) / (unit ? layer[unit] : 1)
          : operation === "multiply"
            ? value / baseline
            : value
        : value,
    );
    return { target: destination, operation, ...(unit ? { unit } : {}), points };
  });
  const preset: MotionAnimationPreset = {
    version: 1,
    id,
    name,
    category: "custom",
    duration: Math.max(1, Math.round((last - first) * 1000)),
    effects,
    channels,
  };
  validateMotionAnimationPreset(preset);
  return preset;
}
