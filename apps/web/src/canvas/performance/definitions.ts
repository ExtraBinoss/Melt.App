import type { CompositionPerformanceMetric } from "../../state/session/composition-performance";

/** Feature domains and counters are data definitions, so new profilers need no UI switch. */
export const performanceDomains = [
  "scene",
  "spatial",
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
  "spatialLayers",
  "spatialMeshes",
  "spatialVertices",
  "spatialTriangles",
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

export function performanceMetricLabel(
  id: string,
  t: (key: string, options?: Record<string, string>) => string,
): string {
  if (id === "cpu") return t("timings.cpu");
  if (id === "otherCpu") return t("metrics.otherCpu");
  if (id.startsWith("gpuPass:")) {
    const [kind, ...stage] = id.slice(8).split("/");
    const label = t(`gpuStages.${kind}`, { defaultValue: t("gpuStages.other") });
    return stage.length ? `${label} · ${stage.join("/")}` : label;
  }
  return performanceMetrics.has(id) ? t(`metrics.${id}`) : t("additionalMetric", { id });
}
