import {
  getEffectDefinition,
  listMotionProperties,
  listSceneMotionProperties,
  planMotionInitialization,
  compileAnimationChannel,
  type AnimationChannel,
  type Effect,
  type EnginePort,
  type MotionAnimationPreset,
  type MotionDriver,
  type MotionPropertyDescriptor,
  type MotionValue,
  type SceneMotionPropertyDescriptor,
  type SceneMotionAnimationPreset,
  type SceneAnimationTarget,
} from "@musart/core";
import { createMotionTransport } from "../../../../services/motion/transport";
import type { DriverRange } from "./DriverRange";
import { animationPresentation } from "../../../motion/animations/presentation";

export type EffectDriverProperty = MotionPropertyDescriptor | SceneMotionPropertyDescriptor;

export function effectMotionProperties(engine: EnginePort, effect: Effect) {
  const snapshot = engine.getSnapshot();
  const page = snapshot.project.pages.find((page) => page.id === snapshot.pageId)!;
  const definition = getEffectDefinition(effect.type);
  const preferred = definition.sdk?.preferredTargets ?? ["time", "amount"];
  return [...listMotionProperties(page), ...listSceneMotionProperties(page)]
    .filter(
      (property) =>
        "effectId" in property.target &&
        property.target.effectId === effect.id &&
        (definition.parameters.some(
          (parameter) =>
            parameter.key === property.target.property &&
            (parameter.scope === "settings") ===
              (property.target.kind === "effectSetting" ||
                property.target.kind === "compositionEffectSetting"),
        ) ||
          ["enabled", "opacity", "blendMode"].includes(property.target.property)),
    )
    .sort((left, right) => {
      const rank = (key: string) => {
        const index = preferred.indexOf(key);
        return index < 0 ? preferred.length : index;
      };
      return rank(left.target.property) - rank(right.target.property);
    });
}

export function motionPropertyKey(property: EffectDriverProperty): string {
  return `${property.target.kind}:${property.target.property}`;
}

/** Two meaningful output endpoints. Detailed Motion editing retains the authoritative typed map. */
export function effectDriverChannel(
  property: EffectDriverProperty,
  driver: MotionDriver,
  range?: DriverRange,
): AnimationChannel {
  const target = property.target;
  if (
    !["effect", "effectSetting", "compositionEffect", "compositionEffectSetting"].includes(
      target.kind,
    )
  )
    throw new Error("Expected an effect property");
  let from: MotionValue = property.value,
    to: MotionValue = property.value;
  if (property.kind === "number" || property.kind === "integer") {
    if (target.property === "time") {
      from = 0;
      to = Math.min(2, property.max);
    } else {
      const span = Math.min(
        property.max - property.min,
        Math.max(property.kind === "integer" ? 2 : 1, Math.abs(property.value)),
      );
      from = Math.max(property.min, property.value - span / 2);
      to = Math.min(property.max, property.value + span / 2);
    }
    if (property.kind === "integer") {
      from = Math.round(from as number);
      to = Math.round(to as number);
    }
  } else if (property.kind === "boolean") {
    from = false;
    to = true;
  } else if (property.kind === "choice")
    to =
      property.options[(property.options.indexOf(property.value) + 1) % property.options.length]!;
  else if (property.kind === "color")
    to = property.value.toLowerCase() === "#ffffff" ? "#000000" : "#ffffff";
  if (range) [from, to] = range;
  let channelTarget: AnimationChannel["target"];
  if (target.kind === "effect" || target.kind === "compositionEffect")
    channelTarget = { kind: "effect", slot: 0, property: target.property };
  else if (target.kind === "effectSetting" || target.kind === "compositionEffectSetting")
    channelTarget = { kind: "effectSetting", slot: 0, property: target.property };
  else throw new Error("Expected an effect property");
  return {
    target: channelTarget,
    operation: "replace",
    driver,
    points: [
      { at: 0, value: from },
      ...(property.interpolation === "hold" ? [{ at: 0.5, value: to }] : []),
      { at: 1, value: to },
    ],
  };
}

export function effectDriverPreset(
  effect: Effect,
  channel: AnimationChannel | AnimationChannel[],
  name: string,
): MotionAnimationPreset {
  const { id: _id, inputs: _inputs, ...definition } = effect;
  const channels = Array.isArray(channel) ? channel : [channel];
  return {
    version: 1,
    id: `effect-driver-${channels[0]!.driver!.kind}`,
    name,
    category: "custom",
    duration: 2000,
    effects: [definition],
    channels,
  };
}

export function addEffectDriver(
  engine: EnginePort,
  effect: Effect,
  channel: AnimationChannel | AnimationChannel[],
  name: string,
  durationMs = 2000,
): void {
  const snapshot = engine.getSnapshot();
  const page = snapshot.project.pages.find((page) => page.id === snapshot.pageId)!;
  const layer = page.layers.find((layer) => layer.effects.some((item) => item.id === effect.id));
  const compositionEffect = page.effects?.some((item) => item.id === effect.id);
  if (!layer && !compositionEffect) throw new Error("Effect owner is unavailable");
  const transport = createMotionTransport(engine);
  transport.pause();
  const start = page.motion?.mode === "motion" ? transport.read().time : { value: 0, rate: 1 };
  const track = page.motion?.tracks.find((track) => track.layerId === layer?.id);
  const preset = effectDriverPreset(effect, channel, name);
  const interval = { start, duration: { value: Math.max(1, Math.round(durationMs)), rate: 1000 } };
  const scenePreset: SceneMotionAnimationPreset = {
    ...preset,
    effects: [],
    channels: preset.channels.map((channel) => {
      const target: SceneAnimationTarget =
        channel.target.kind === "effectSetting"
          ? { kind: "compositionEffectSetting", property: channel.target.property }
          : channel.target.kind === "effect"
            ? { kind: "compositionEffect", property: channel.target.property }
            : (() => {
                throw new Error("Expected an effect channel");
              })();
      return { ...channel, target };
    }),
  };
  engine.transaction([
    ...(page.motion?.mode === "motion"
      ? []
      : [
          {
            type: "setCompositionMode" as const,
            mode: "motion" as const,
            ...(!page.motion ? { plan: planMotionInitialization(snapshot), confirmed: true } : {}),
          },
        ]),
    layer
      ? {
          type: "addMotionAnimation",
          ...(track ? { trackId: track.id } : { layerId: layer.id }),
          preset,
          effectIds: [effect.id],
          ...interval,
        }
      : {
          type: "addMotionAnimation",
          owner: { kind: "compositionEffect", compositionId: page.id, effectId: effect.id },
          preset: scenePreset,
          ...interval,
        },
  ]);
  const next = engine.getSnapshot();
  const updated = next.project.pages.find((page) => page.id === next.pageId)!;
  const animation = layer
    ? updated.motion?.tracks.find((track) => track.layerId === layer.id)?.animations?.at(-1)
    : updated.motion?.sceneAnimations?.at(-1);
  animationPresentation(engine).set({ selected: animation?.id ?? null });
}

export function previewEffectDriver(
  property: EffectDriverProperty,
  channel: AnimationChannel,
  elapsedMs: number,
): Partial<Effect> {
  const sample = compileAnimationChannel<EffectDriverProperty["target"]>(
    {
      start: { value: 0, rate: 1 },
      duration: { value: Math.max(1, Math.round(elapsedMs)), rate: 1000 },
      strength: 1,
    },
    channel,
    property,
  );
  const value = sample.sample({ value: Math.max(0, Math.round(elapsedMs)), rate: 1000 });
  const validated =
    property.kind === "integer" && typeof value === "number" ? Math.round(value) : value;
  return property.target.kind === "effectSetting" ||
    property.target.kind === "compositionEffectSetting"
    ? { settings: { [property.target.property]: validated } }
    : { [property.target.property]: validated };
}

export function effectPropertyLabel(effect: Effect, property: EffectDriverProperty): string {
  const parameter = getEffectDefinition(effect.type).parameters.find(
    (parameter) =>
      parameter.key === property.target.property &&
      (parameter.scope === "settings") ===
        (property.target.kind === "effectSetting" ||
          property.target.kind === "compositionEffectSetting"),
  );
  return (
    parameter?.labelKey ??
    (property.target.property === "enabled" ? "effectControls:enabled" : property.target.property)
  );
}
