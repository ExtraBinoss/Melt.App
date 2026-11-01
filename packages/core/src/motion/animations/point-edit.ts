import { ensure } from "../../errors";
import {
  addMotionTime,
  compareMotionTime,
  motionTimeToSeconds,
  subtractMotionTime,
  type MotionTime,
} from "../time";
import type { MotionAnimation } from "./model";
/** Derived presentation identities never become a second authoritative set of keys. */
export function animationPropertyId(animationId: string, channel: number): string {
  return JSON.stringify(["animation-channel", animationId, channel]);
}
export function animationPointId(animationId: string, channel: number, point: number): string {
  return JSON.stringify(["animation-point", animationId, channel, point]);
}
export function animationPointTime(
  animation: Pick<MotionAnimation<unknown>, "start" | "duration">,
  at: number,
): MotionTime {
  if (at === 0) return animation.start;
  if (at === 1) return addMotionTime(animation.start, animation.duration);
  return addMotionTime(animation.start, {
    value: Math.round(motionTimeToSeconds(animation.duration) * at * 1e9),
    rate: 1e9,
  });
}
export function retimeAnimationPoints<Target>(
  animation: MotionAnimation<Target>,
  selected: readonly (readonly boolean[])[],
  delta: MotionTime,
): MotionAnimation<Target> {
  const shiftStart = selected.some((points) => points[0]),
    shiftEnd = selected.some((points) => points[points.length - 1]);
  const start = shiftStart ? addMotionTime(animation.start, delta) : animation.start;
  const originalEnd = addMotionTime(animation.start, animation.duration),
    end = shiftEnd ? addMotionTime(originalEnd, delta) : originalEnd;
  ensure(
    start.value >= 0 && compareMotionTime(start, end) < 0,
    "INVALID_COMMAND",
    "Invalid animation interval",
  );
  const duration = subtractMotionTime(end, start);
  const channels = animation.preset.channels.map((channel, ci) => {
    let previous = start;
    const points = channel.points.map((point, pi) => {
      if (pi === 0 || pi === channel.points.length - 1) return point;
      const time = selected[ci]![pi]
        ? addMotionTime(animationPointTime(animation, point.at), delta)
        : animationPointTime(animation, point.at);
      ensure(
        compareMotionTime(previous, time) < 0 && compareMotionTime(time, end) < 0,
        "INVALID_COMMAND",
        "Animation points cannot cross",
      );
      previous = time;
      return {
        ...point,
        at: motionTimeToSeconds(subtractMotionTime(time, start)) / motionTimeToSeconds(duration),
      };
    });
    return { ...channel, points };
  });
  return { ...animation, start, duration, preset: { ...animation.preset, channels } };
}
export function removePointsFromAnimation<Target>(
  animation: MotionAnimation<Target>,
  ids: ReadonlySet<string>,
): number {
  let found = 0;
  const channels = animation.preset.channels.flatMap((channel, ci) => {
    const selected = channel.points.map((_, pi) => ids.has(animationPointId(animation.id, ci, pi)));
    const count = selected.filter(Boolean).length;
    found += count;
    if (!count) return [channel];
    if (count === channel.points.length) return [];
    ensure(
      !selected[0] && !selected[selected.length - 1],
      "INVALID_COMMAND",
      "Animation endpoints define its interval",
    );
    return [{ ...channel, points: channel.points.filter((_, pi) => !selected[pi]) }];
  });
  ensure(
    channels.length > 0,
    "INVALID_COMMAND",
    "Delete the animation block to remove its last property",
  );
  animation.preset = { ...animation.preset, channels };
  return found;
}
