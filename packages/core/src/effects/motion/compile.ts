import type { Composition, Effect } from "../../document/model";
import { ensure } from "../../errors";
import {
  compileAnimationChannel,
  type CompiledAnimationChannel,
} from "../../motion/animations/compile";
import type { AnimationChannel } from "../../motion/animations/model";
import type { MotionPropertyTarget } from "../../motion/properties/model";
import type { SceneMotionPropertyTarget } from "../../motion/scene/model";
import { resolveMotionProperty } from "../../motion/properties/registry";
import { resolveSceneMotionProperty } from "../../motion/scene/properties";
import type { EffectMotionAction } from "./model";

export type EffectMotionTarget = MotionPropertyTarget | SceneMotionPropertyTarget;
export function directEffectTarget(
  pageId: string,
  effectId: string,
  channel: AnimationChannel,
  layerId?: string,
): EffectMotionTarget {
  ensure(
    channel.target.kind === "effect" || channel.target.kind === "effectSetting",
    "INVALID_DOCUMENT",
    "Expected an effect channel",
  );
  return layerId
    ? channel.target.kind === "effect"
      ? { kind: "effect", layerId, effectId, property: channel.target.property }
      : { kind: "effectSetting", layerId, effectId, property: channel.target.property }
    : channel.target.kind === "effect"
      ? {
          kind: "compositionEffect",
          compositionId: pageId,
          effectId,
          property: channel.target.property,
        }
      : {
          kind: "compositionEffectSetting",
          compositionId: pageId,
          effectId,
          property: channel.target.property,
        };
}
export function compileDirectEffectAction(
  page: Composition,
  effect: Effect,
  action: EffectMotionAction,
  layerId?: string,
): CompiledAnimationChannel<EffectMotionTarget>[] {
  return action.channels.map((channel) => {
    const driver = channel.driver;
    const duration = page.motion?.duration;
    // An integral cycle count also closes the composition's playback/export seam.
    if (driver && "period" in driver && duration) {
      const cycles = Math.max(
        1,
        Math.round(duration.value / duration.rate / (driver.period.value / driver.period.rate)),
      );
      channel = {
        ...channel,
        driver: { ...driver, period: { value: duration.value, rate: duration.rate * cycles } },
      };
    }
    const target = directEffectTarget(page.id, effect.id, channel, layerId);
    const descriptor =
      "compositionId" in target
        ? resolveSceneMotionProperty(page, target)
        : resolveMotionProperty(page, target);
    ensure(descriptor, "INVALID_DOCUMENT", "Direct effect property is unavailable");
    return compileAnimationChannel<EffectMotionTarget>(
      { start: { value: 0, rate: 1 }, duration: { value: 86400, rate: 1 }, strength: 1 },
      channel,
      descriptor,
    );
  });
}
export function compileLayerEffectMotion(
  page: Composition,
  layerId: string,
): CompiledAnimationChannel[] {
  const effects = page.layers.find((layer) => layer.id === layerId)!.effects;
  return effects.flatMap((effect) =>
    effect.enabled && effect.motion?.automatic
      ? (compileDirectEffectAction(
          page,
          effect,
          effect.motion.automatic,
          layerId,
        ) as CompiledAnimationChannel[])
      : [],
  );
}
export function compileCompositionEffectMotion(
  page: Composition,
): CompiledAnimationChannel<SceneMotionPropertyTarget>[] {
  return (page.effects ?? []).flatMap((effect) =>
    effect.enabled && effect.motion?.automatic
      ? (compileDirectEffectAction(
          page,
          effect,
          effect.motion.automatic,
        ) as CompiledAnimationChannel<SceneMotionPropertyTarget>[])
      : [],
  );
}
