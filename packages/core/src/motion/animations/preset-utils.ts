import { cloneValue } from "../../document/immutable";
import { ensure } from "../../errors";
import type { MotionKeyframe } from "../model";
import type { MotionValue } from "../properties/model";
import { motionTimeToSeconds } from "../time";
import type { AnimationChannel, MotionAnimation, MotionAnimationPreset } from "./model";
export function captureAnimationRecipe<Target>(
  animation: MotionAnimation<Target>,
  name: string,
  id: string,
  base: (channel: AnimationChannel<Target>) => { value: MotionValue; multiplier: number },
  options: { bakeStrength?: boolean } = {},
): MotionAnimationPreset<Target> {
  const preset = cloneValue(animation.preset);
  preset.id = id;
  preset.name = name;
  if (options.bakeStrength !== false)
    preset.duration = Math.max(1, Math.round(motionTimeToSeconds(animation.duration) * 1000));
  for (const channel of preset.channels) {
    const source = base(channel);
    for (const point of channel.points) {
      if (typeof point.value !== "number" || typeof source.value !== "number") continue;
      const neutral =
        channel.operation === "add"
          ? 0
          : channel.operation === "multiply"
            ? 1
            : source.value / source.multiplier;
      if (options.bakeStrength !== false)
        point.value = neutral + (point.value - neutral) * animation.strength;
    }
  }
  return preset;
}
export function propertyTimelineInterval(
  properties: readonly { keyframes: readonly MotionKeyframe[] }[],
) {
  ensure(
    properties.length > 0,
    "INVALID_COMMAND",
    "Select a timeline containing at least two keyframes",
  );
  const first = Math.min(
    ...properties.map((property) => motionTimeToSeconds(property.keyframes[0]!.time)),
  );
  const last = Math.max(
    ...properties.map((property) => motionTimeToSeconds(property.keyframes.at(-1)!.time)),
  );
  ensure(last > first, "INVALID_COMMAND", "Animation interval must be positive");
  return { first, last };
}
export function normalizedPropertyPoints(
  keys: readonly MotionKeyframe[],
  first: number,
  last: number,
  value: (value: MotionValue) => MotionValue = (value) => value,
) {
  const points = keys.map((key) => ({
    at: (motionTimeToSeconds(key.time) - first) / (last - first),
    value: value(key.value),
    ...(key.easing ? { easing: cloneValue(key.easing) } : {}),
  }));
  if (points[0]!.at > 0) points.unshift({ ...points[0]!, at: 0 });
  if (points.at(-1)!.at < 1) points.push({ ...points.at(-1)!, at: 1 });
  return points;
}
