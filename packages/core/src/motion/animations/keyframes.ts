import type { Composition } from "../../document/model";
import type { MotionLayerTrack, MotionPropertyTrack } from "../model";
import type { MotionTime } from "../time";
import type { MotionAnimation } from "./model";
import type { SceneMotionAnimation } from "../scene/animations/model";
import { animationTarget } from "./targets";
import {
  animationPointId,
  animationPointTime,
  animationPropertyId,
  retimeAnimationPoints,
  removePointsFromAnimation,
} from "./point-edit";
export { animationPointId, animationPointTime, animationPropertyId } from "./point-edit";
export function projectAnimationProperties(track: MotionLayerTrack) {
  return (track.animations ?? []).flatMap((animation) =>
    animation.preset.channels.map((channel, channelIndex) => ({
      animation,
      channelIndex,
      property: {
        id: animationPropertyId(animation.id, channelIndex),
        target: animationTarget(track.layerId, animation, channel.target),
        keyframes: channel.points.map((point, index) => ({
          id: animationPointId(animation.id, channelIndex, index),
          time: animationPointTime(animation, point.at),
          value: point.value,
          ...(point.easing ? { easing: point.easing } : {}),
        })),
      } satisfies MotionPropertyTrack,
    })),
  );
}
export function projectMotionProperties(track: MotionLayerTrack): MotionPropertyTrack[] {
  return [...track.properties, ...projectAnimationProperties(track).map((entry) => entry.property)];
}
type Entry = (
  | { kind: "layer"; track: MotionLayerTrack; animation: MotionAnimation }
  | { kind: "scene"; animation: SceneMotionAnimation }
) & { selected: boolean[][] };
/** Both owner domains share point timing, endpoint trimming and crossing constraints. */
export function captureAnimationPointMove(page: Composition, ids: ReadonlySet<string>) {
  const found = new Set<string>();
  const entries: Entry[] = [];
  const select = (animation: MotionAnimation<unknown>) =>
    animation.preset.channels.map((channel, ci) =>
      channel.points.map((_, pi) => {
        const id = animationPointId(animation.id, ci, pi);
        if (!ids.has(id)) return false;
        found.add(id);
        return true;
      }),
    );
  for (const track of page.motion?.tracks ?? [])
    for (const animation of track.animations ?? []) {
      const selected = select(animation);
      if (selected.some((points) => points.some(Boolean)))
        entries.push({ kind: "layer", track, animation, selected });
    }
  for (const animation of page.motion?.sceneAnimations ?? []) {
    const selected = select(animation);
    if (selected.some((points) => points.some(Boolean)))
      entries.push({ kind: "scene", animation, selected });
  }
  const sample = (delta: MotionTime): Map<string, MotionAnimation> =>
    new Map(
      entries.flatMap((entry) =>
        entry.kind === "layer"
          ? [
              [
                entry.animation.id,
                retimeAnimationPoints(entry.animation, entry.selected, delta),
              ] as const,
            ]
          : [],
      ),
    );
  const sampleScene = (delta: MotionTime): Map<string, SceneMotionAnimation> =>
    new Map(
      entries.flatMap((entry) =>
        entry.kind === "scene"
          ? [
              [
                entry.animation.id,
                {
                  ...entry.animation,
                  ...retimeAnimationPoints(entry.animation, entry.selected, delta),
                },
              ] as const,
            ]
          : [],
      ),
    );
  return { found, entries, sample, sampleScene };
}
export function removeAnimationPoints(page: Composition, ids: ReadonlySet<string>): number {
  let found = 0;
  for (const track of page.motion?.tracks ?? [])
    for (const animation of track.animations ?? [])
      found += removePointsFromAnimation(animation, ids);
  for (const animation of page.motion?.sceneAnimations ?? [])
    found += removePointsFromAnimation(animation, ids);
  return found;
}
