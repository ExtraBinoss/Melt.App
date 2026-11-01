import {
  addMotionTime,
  captureMotionAnimationPreset,
  captureSceneMotionAnimationPreset,
  type Command,
  type Composition,
  type MotionAnimation,
  type SceneMotionAnimation,
} from "@musart/core";
import type { StoredMotionPreset } from "../../../services/motion/animations/presets";
export type EditableAnimation = MotionAnimation | SceneMotionAnimation;
export function captureAnimationPreset(
  page: Composition,
  animation: EditableAnimation,
  name: string,
  id: string,
  layerId?: string,
  bakeStrength = true,
): StoredMotionPreset {
  return "owner" in animation
    ? captureSceneMotionAnimationPreset(page, animation, name, id, { bakeStrength })
    : captureMotionAnimationPreset(page, layerId!, animation, name, id, { bakeStrength });
}
export function duplicateAnimationCommand(
  page: Composition,
  animation: EditableAnimation,
  layerId?: string,
  trackId?: string,
): Command {
  const fields = {
    start: addMotionTime(animation.start, animation.duration),
    duration: animation.duration,
    strength: animation.strength,
    enabled: animation.enabled,
  };
  if ("owner" in animation)
    return {
      type: "addMotionAnimation",
      owner: animation.owner,
      preset: captureSceneMotionAnimationPreset(
        page,
        animation,
        animation.preset.name,
        animation.preset.id,
        { bakeStrength: false },
      ),
      ...fields,
    };
  return {
    type: "addMotionAnimation",
    trackId: trackId!,
    preset: captureMotionAnimationPreset(
      page,
      layerId!,
      animation,
      animation.preset.name,
      animation.preset.id,
      { bakeStrength: false },
    ),
    ...fields,
  };
}
export function reverseAnimationPreset(preset: StoredMotionPreset): StoredMotionPreset {
  const copy = structuredClone(preset);
  for (const channel of copy.channels)
    channel.points = channel.points.map((point) => ({ ...point, at: 1 - point.at })).reverse();
  return copy;
}
