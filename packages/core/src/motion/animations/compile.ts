import type { Composition } from "../../document/model";
import { ensure } from "../../errors";
import { compileMotionInterpolator } from "../interpolation";
import { resolveMotionProperty } from "../properties/registry";
import type { MotionPropertySchema, MotionPropertyTarget, MotionValue } from "../properties/model";
import type { SceneMotionPropertyTarget } from "../scene/model";
import { addMotionTime, motionTimeProgress, compareMotionTime, subtractMotionTime } from "../time";
import type { MotionTime } from "../time";
import type { MotionLayerTrack } from "../model";
import type { AnimationChannel, MotionAnimation } from "./model";
import { animationAddress, animationTarget } from "./targets";
import { compileMotionDriver } from "../drivers/compile";
export type AnimationPropertyTarget = MotionPropertyTarget | SceneMotionPropertyTarget;
export type AnimationPropertyDescriptor<Target = MotionPropertyTarget> = MotionPropertySchema & {
  readonly target: Target;
  readonly value: MotionValue;
};
export interface CompiledAnimationChannel<
  Target extends AnimationPropertyTarget = MotionPropertyTarget,
> {
  descriptor: AnimationPropertyDescriptor<Target>;
  address: string;
  operation: "add" | "multiply" | "replace";
  strength: number;
  sample(time: MotionTime): MotionValue;
}
/** One sampler for layer and composition-owned recipes, using the ordinary easing engine. */
export function compileAnimationChannel<Target extends AnimationPropertyTarget>(
  animation: Pick<MotionAnimation<unknown>, "start" | "duration" | "strength">,
  channel: AnimationChannel<unknown>,
  descriptor: AnimationPropertyDescriptor<Target>,
  multiplier = 1,
): CompiledAnimationChannel<Target> {
  const points = channel.points.map((point) => ({
    ...point,
    value: typeof point.value === "number" ? point.value * multiplier : point.value,
  }));
  const interpolation =
    descriptor.kind === "number" || descriptor.kind === "integer"
      ? { ...descriptor, kind: "number" as const, min: -1e12, max: 1e12 }
      : descriptor;
  const segments = points
    .slice(1)
    .map((point, index) =>
      compileMotionInterpolator(interpolation, points[index]!.value, point.value, point.easing),
    );
  const end = addMotionTime(animation.start, animation.duration);
  const driver = channel.driver ? compileMotionDriver(channel.driver) : undefined;
  return {
    descriptor,
    address: animationAddress(descriptor.target),
    operation: channel.operation,
    strength: animation.strength,
    sample(time) {
      const progress = driver
        ? driver(
            compareMotionTime(time, animation.start) <= 0
              ? { value: 0, rate: 1 }
              : subtractMotionTime(compareMotionTime(time, end) > 0 ? end : time, animation.start),
          )
        : motionTimeProgress(time, animation.start, end);
      if (progress <= 0) return points[0]!.value;
      if (progress >= 1) return points[points.length - 1]!.value;
      let index = 1;
      while (index < points.length - 1 && points[index]!.at < progress) index++;
      const left = points[index - 1]!,
        right = points[index]!;
      return segments[index - 1]!((progress - left.at) / (right.at - left.at));
    },
  };
}
export function compileAnimations(
  page: Composition,
  track: MotionLayerTrack,
): CompiledAnimationChannel[] {
  const layer = page.layers.find((layer) => layer.id === track.layerId)!;
  return (track.animations ?? [])
    .filter((animation) => animation.enabled)
    .flatMap((animation) =>
      animation.preset.channels.map((channel) => {
        const descriptor = resolveMotionProperty(
          page,
          animationTarget(layer.id, animation, channel.target),
        );
        ensure(descriptor, "INVALID_DOCUMENT", "Animation target is missing");
        return compileAnimationChannel(
          animation,
          channel,
          descriptor,
          channel.unit ? layer[channel.unit] : 1,
        );
      }),
    );
}
/** Actions compose in authored order after ordinary keyframes; add/multiply are explicit. */
export function evaluateAnimations<Target extends AnimationPropertyTarget>(
  channels: readonly CompiledAnimationChannel<Target>[],
  time: MotionTime,
  values: { readonly target: Target; readonly value: MotionValue }[],
  firstValue = 0,
): void {
  const indexes = new Map(
    values
      .slice(firstValue)
      .map((entry, index) => [animationAddress(entry.target), firstValue + index]),
  );
  for (const channel of channels) {
    const index = indexes.get(channel.address);
    const current = index === undefined ? channel.descriptor.value : values[index]!.value;
    const sampled = channel.sample(time);
    let value: MotionValue = sampled;
    if (typeof sampled === "number" && typeof current === "number") {
      if (channel.operation === "add") value = current + sampled * channel.strength;
      else if (channel.operation === "multiply")
        value = current * (1 + (sampled - 1) * channel.strength);
      else value = current + (sampled - current) * channel.strength;
      const descriptor = channel.descriptor;
      if (descriptor.kind === "number" || descriptor.kind === "integer")
        value = Math.max(
          descriptor.min,
          Math.min(descriptor.max, descriptor.kind === "integer" ? Math.round(value) : value),
        );
    }
    const entry = Object.freeze({ target: channel.descriptor.target, value });
    if (index === undefined) {
      indexes.set(channel.address, values.length);
      values.push(entry);
    } else values[index] = entry;
  }
}
