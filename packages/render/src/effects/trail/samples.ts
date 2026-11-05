import {
  compareMotionTime,
  resolveEffectSettings,
  subtractMotionTime,
  validateMotionTime,
  type Effect,
  type MotionTime,
} from "@musart/core";

/** A request captures the upstream owner at an exact previous composition timestamp. */
export interface TrailSampleRequest {
  readonly slot: number;
  readonly time: MotionTime;
  readonly beforeEffectId: string;
  /** Historical renders cannot recursively request their own temporal inputs. */
  readonly history: "disabled";
}

/** CPU scheduling only: no motion evaluation, image access, allocations of GPU resources or history. */
export function getTrailSamples(effect: Effect, time: MotionTime): readonly TrailSampleRequest[] {
  validateMotionTime(time);
  if (effect.type !== "trail" || !effect.enabled || effect.amount <= 0) return [];
  const settings = resolveEffectSettings(effect);
  if (settings.mode !== "temporal") return [];
  const count = Number(settings.echoCount),
    delay = Number(settings.delay);
  if (!Number.isInteger(count) || count < 1 || count > 8 || !Number.isFinite(delay) || delay < 0.001 || delay > 5)
    throw new RangeError("Trail requires one to eight echoes and a delay between 0.001 and 5 seconds.");
  if (Number(settings.fade) <= 0) return [];
  // Seconds are an API boundary. Quantize once to microseconds, then subtract exact rational times.
  const delayTicks = Math.round(delay * 1_000_000),
    samples: TrailSampleRequest[] = [];
  for (let slot = 0; slot < count; slot += 1) {
    const previous = subtractMotionTime(time, { value: delayTicks * (slot + 1), rate: 1_000_000 });
    if (compareMotionTime(previous, { value: 0, rate: 1 }) < 0) break;
    samples.push(Object.freeze({
      slot,
      time: Object.freeze(previous),
      beforeEffectId: effect.id,
      history: "disabled" as const,
    }));
  }
  return Object.freeze(samples);
}
