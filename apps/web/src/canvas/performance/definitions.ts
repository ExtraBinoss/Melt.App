import type { CompositionPerformanceMetric } from "../../state/session/composition-performance";

/** Feature domains and counters are data definitions, so new profilers need no UI switch. */
export const performanceDomains = [
  "scene",
  "images",
  "videos",
  "shapes",
  "text",
  "animation",
  "audio",
  "gpu",
] as const;
export const performanceMetrics = new Set([
  "layers",
  "visibleLayers",
  "images",
  "videos",
  "shapes",
  "textLayers",
  "groups",
  "effects",
  "masks",
  "animationTracks",
  "animationChannels",
  "animationUpdate",
  "audioTracks",
  "audioProcessing",
  "drawCommands",
  "renderPasses",
  "allocations",
  "uploads",
  "textureBytes",
  "cacheEntries",
  "cacheHits",
  "cacheMisses",
  "sourcePreparation",
  "textPreparation",
  "composition",
]);

export function performanceDomainIds(metrics: readonly CompositionPerformanceMetric[]): string[] {
  return [...new Set<string>([...performanceDomains, ...metrics.map((metric) => metric.domain)])];
}

/** Each timing is compared independently: overlapping CPU/GPU times must never be summed. */
export function budgetFraction(value: number | null, budgetMs: number): number {
  if (
    value === null ||
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isFinite(budgetMs) ||
    budgetMs <= 0
  )
    return 0;
  return Math.min(1, value / budgetMs);
}
