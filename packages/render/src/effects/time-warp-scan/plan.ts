import { normalizeMotionTime, resolveEffectSettings, type Bounds, type Effect } from "@musart/core";
export interface ScanPlan {
  readonly phase: number;
  readonly samples: number;
  readonly direction: string;
  readonly start: number;
  readonly duration: number;
  readonly settingsKey: string;
}
export function scanPlan(effect: Effect, timeline: boolean): ScanPlan {
  const settings = resolveEffectSettings(effect);
  const start = Number(settings.start),
    duration = Number(settings.duration);
  const {
    progress: _progress,
    feather: _feather,
    showLine: _showLine,
    lineWidth: _lineWidth,
    lineColor: _lineColor,
    clock: _clock,
    ...captureSettings
  } = settings;
  return {
    phase: Math.max(
      0,
      Math.min(
        1,
        timeline && settings.clock === "timeline"
          ? ((effect.time ?? 0) - start) / duration
          : Number(settings.progress),
      ),
    ),
    samples: Math.round(Number(settings.samples)),
    direction: String(settings.direction),
    start,
    duration,
    settingsKey: JSON.stringify(captureSettings),
  };
}
export function stripRectangle(
  width: number,
  height: number,
  content: Bounds,
  direction: string,
  index: number,
  samples: number,
): Bounds {
  const vertical = direction === "down" || direction === "up",
    reverse = direction === "up" || direction === "left";
  const low = reverse ? 1 - (index + 1) / samples : index / samples;
  const high = reverse ? 1 - index / samples : (index + 1) / samples;
  const origin = vertical ? content.y : content.x,
    size = vertical ? content.height : content.width,
    extent = vertical ? height : width;
  const from = Math.max(0, low <= 0 ? 0 : Math.floor(origin + low * size));
  const to = Math.min(extent, high >= 1 ? extent : Math.floor(origin + high * size));
  return vertical
    ? { x: 0, y: from, width, height: Math.max(0, to - from) }
    : { x: from, y: 0, width: Math.max(0, to - from), height };
}

/** Keep subdivision exact: rounding every sample separately can select the previous video frame. */
export function scanSampleTime(plan: ScanPlan, index: number, offset: number) {
  const resolution = 1_000_000;
  return normalizeMotionTime({
    value: Math.max(
      0,
      Math.round((plan.start - offset) * resolution) * plan.samples +
        Math.round(plan.duration * resolution) * index,
    ),
    rate: resolution * plan.samples,
  });
}
