import { sceneAnimationTarget } from "../motion/scene/animations/targets";
import type { Composition } from "../document/model";
import type { MotionPropertyTarget } from "../motion/properties/model";
import type { SceneMotionPropertyTarget } from "../motion/scene/model";
import type { MotionKeyframe } from "../motion/model";
import { animationPointId, animationPointTime } from "../motion/animations/point-edit";
import { animationTarget } from "../motion/animations/targets";
import type { HistoryContext } from "./collector";
import type { HistoryPropertyTarget } from "./model";
export type AuthoredTarget = MotionPropertyTarget | SceneMotionPropertyTarget;
export function historyTarget(
  context: HistoryContext,
  target: AuthoredTarget,
): HistoryPropertyTarget | null {
  if (target.kind === "layer")
    return {
      owner: { kind: "layer", compositionId: context.page.id, layerId: target.layerId },
      property: target.property,
    };
  if (target.kind === "effect" || target.kind === "effectSetting") {
    const effect = context
      .layers()
      .get(target.layerId)
      ?.effects.find((effect) => effect.id === target.effectId);
    return effect
      ? {
          owner: {
            kind: "effect",
            compositionId: context.page.id,
            layerId: target.layerId,
            effectId: target.effectId,
            effectType: effect.type,
          },
          property:
            target.kind === "effectSetting" ? `settings.${target.property}` : target.property,
        }
      : null;
  }
  if (target.kind === "compositionEffect" || target.kind === "compositionEffectSetting") {
    const effect = context.page.effects?.find((effect) => effect.id === target.effectId);
    return effect
      ? {
          owner: {
            kind: "effect",
            compositionId: target.compositionId,
            effectId: effect.id,
            effectType: effect.type,
          },
          property:
            target.kind === "compositionEffectSetting"
              ? `settings.${target.property}`
              : target.property,
        }
      : null;
  }
  const { property, ...owner } = target;
  return { owner, property } as HistoryPropertyTarget;
}
export interface KeyReference {
  readonly id: string;
  readonly target: AuthoredTarget;
  readonly trackId?: string;
  read(): MotionKeyframe | undefined;
}
/** Scan registered key owners once. Only selected references are handed to the bounded collector. */
export function visitKeys(
  page: Composition,
  ids: ReadonlySet<string>,
  visit: (key: KeyReference) => void,
): void {
  for (const track of page.motion?.tracks ?? []) {
    for (const property of track.properties)
      for (const key of property.keyframes)
        if (ids.has(key.id))
          visit({
            id: key.id,
            target: property.target,
            trackId: track.id,
            read: () =>
              page.motion?.tracks
                .find((item) => item.id === track.id)
                ?.properties.find((item) => item.id === property.id)
                ?.keyframes.find((item) => item.id === key.id),
          });
    for (const animation of track.animations ?? [])
      for (const [ci, channel] of animation.preset.channels.entries())
        for (const [pi] of channel.points.entries()) {
          const id = animationPointId(animation.id, ci, pi);
          if (!ids.has(id)) continue;
          visit({
            id,
            target: animationTarget(track.layerId, animation, channel.target),
            trackId: track.id,
            read: () => {
              const current = page.motion?.tracks
                .find((item) => item.id === track.id)
                ?.animations?.find((item) => item.id === animation.id);
              const point = current?.preset.channels[ci]?.points[pi];
              return current && point
                ? {
                    id,
                    value: point.value,
                    time: animationPointTime(current, point.at),
                    ...(point.easing ? { easing: point.easing } : {}),
                  }
                : undefined;
            },
          });
        }
  }
  for (const property of page.motion?.sceneProperties ?? [])
    for (const key of property.keyframes)
      if (ids.has(key.id))
        visit({
          id: key.id,
          target: property.target,
          read: () =>
            page.motion?.sceneProperties
              ?.find((item) => item.id === property.id)
              ?.keyframes.find((item) => item.id === key.id),
        });
  for (const animation of page.motion?.sceneAnimations ?? [])
    for (const [ci, channel] of animation.preset.channels.entries())
      for (const [pi] of channel.points.entries()) {
        const id = animationPointId(animation.id, ci, pi);
        if (!ids.has(id)) continue;
        visit({
          id,
          target: sceneAnimationTarget(animation.owner, channel.target),
          read: () => {
            const current = page.motion?.sceneAnimations?.find((item) => item.id === animation.id);
            const point = current?.preset.channels[ci]?.points[pi];
            return current && point
              ? {
                  id,
                  value: point.value,
                  time: animationPointTime(current, point.at),
                  ...(point.easing ? { easing: point.easing } : {}),
                }
              : undefined;
          },
        });
      }
}
