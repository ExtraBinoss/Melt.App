import { frameContributions } from "./contributions";
import type { Composition } from "@musart/core";
import type { SceneFrameSample } from "../render/scene-profile-source";
import type {
  CompositionPerformanceMetric,
  CompositionPerformanceSnapshot,
  CompositionPerformanceValue,
} from "../../state/session/composition-performance";
import { compositionInventory } from "./inventory";

export function percentile95(values: readonly number[]): number | null {
  const finite = values
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  return finite.length ? finite[Math.ceil(finite.length * 0.95) - 1]! : null;
}
const value = (
  number: number | null,
  missing: "unavailable" | "not-measured" = "not-measured",
): CompositionPerformanceValue => ({
  value: number,
  availability: number === null ? missing : "measured",
});
export interface PerformanceReportInput {
  page: Composition;
  samples: readonly SceneFrameSample[];
  durationMs: number;
  animationIntervals: readonly { start: number; end: number }[];
  uploadsBefore: number;
  hitsBefore: number;
}
export interface PerformanceContributor {
  id: string;
  collect(input: PerformanceReportInput): readonly CompositionPerformanceMetric[];
}
const metric = (
  id: string,
  domain: string,
  unit: CompositionPerformanceMetric["unit"],
  number: number | null,
  kind: CompositionPerformanceMetric["kind"] = "counter",
): CompositionPerformanceMetric => ({ id, domain, unit, kind, ...value(number) });
const contributors = new Map<string, PerformanceContributor>();
/** An extension adds metrics without changing the measurement loop or the popover. */
export function registerPerformanceContributor(contributor: PerformanceContributor) {
  if (contributors.has(contributor.id) || contributors.size >= 32)
    throw new Error("Performance contributor identity/capacity conflict");
  contributors.set(contributor.id, contributor);
  return () => {
    if (contributors.get(contributor.id) === contributor) contributors.delete(contributor.id);
  };
}
registerPerformanceContributor({
  id: "inventory",
  collect: ({ page }) => compositionInventory(page),
});
registerPerformanceContributor({
  id: "spatial",
  collect: ({ page, samples }) => {
    const counts = samples.at(-1)?.stats?.spatial;
    return [
      metric(
        "spatialLayers",
        "spatial",
        "count",
        page.layers.filter((layer) => layer.spatial?.enabled).length,
        "inventory",
      ),
      metric(
        "spatialMeshes",
        "spatial",
        "count",
        counts?.meshes ?? (page.layers.some((layer) => layer.spatial?.enabled) ? null : 0),
        "inventory",
      ),
      metric(
        "spatialVertices",
        "spatial",
        "count",
        counts?.vertices ?? (page.layers.some((layer) => layer.spatial?.enabled) ? null : 0),
        "inventory",
      ),
      metric(
        "spatialTriangles",
        "spatial",
        "count",
        counts?.triangles ?? (page.layers.some((layer) => layer.spatial?.enabled) ? null : 0),
        "inventory",
      ),
    ];
  },
});
registerPerformanceContributor({
  id: "render",
  collect: ({ samples, uploadsBefore, hitsBefore }) => {
    const stats = samples.at(-1)?.stats;
    return [
      metric(
        "drawCommands",
        "gpu",
        "count",
        percentile95(samples.map((sample) => sample.drawCommands)),
      ),
      metric("renderPasses", "gpu", "count", percentile95(samples.map((sample) => sample.passes))),
      metric("allocations", "gpu", "count", stats?.targets ?? null),
      metric("uploads", "gpu", "count", stats ? Math.max(0, stats.uploads - uploadsBefore) : null),
      metric("textureBytes", "gpu", "bytes", stats?.cacheBytes ?? null),
      metric("cacheEntries", "gpu", "count", stats?.cacheEntries ?? null),
      metric("cacheHits", "gpu", "count", stats ? Math.max(0, stats.cacheHits - hitsBefore) : null),
    ];
  },
});
registerPerformanceContributor({
  id: "gpu-passes",
  collect: ({ samples }) => {
    const names = [...new Set(samples.flatMap((sample) => Object.keys(sample.gpuPasses ?? {})))];
    return names
      .slice(0, 64)
      .map((name) =>
        metric(
          `gpuPass:${name}`,
          "gpu",
          "ms",
          percentile95(
            samples.flatMap((sample) => (sample.gpuPasses ? [sample.gpuPasses[name] ?? 0] : [])),
          ),
          "timing",
        ),
      );
  },
});
registerPerformanceContributor({
  id: "preparation",
  collect: ({ samples }) => [
    metric(
      "sourcePreparation",
      "scene",
      "ms",
      percentile95(
        samples.flatMap((sample) =>
          sample.phases.sources === null || sample.phases.pipeline === null
            ? []
            : [sample.phases.sources + sample.phases.pipeline],
        ),
      ),
      "timing",
    ),
    metric(
      "textPreparation",
      "text",
      "ms",
      percentile95(
        samples.flatMap((sample) => (sample.phases.text === null ? [] : [sample.phases.text])),
      ),
      "timing",
    ),
    metric(
      "composition",
      "scene",
      "ms",
      percentile95(
        samples.flatMap((sample) =>
          sample.phases.compose === null ? [] : [sample.phases.compose],
        ),
      ),
      "timing",
    ),
  ],
});
registerPerformanceContributor({
  id: "animation-host",
  collect: ({ page, animationIntervals }) =>
    page.motion?.mode === "motion"
      ? [
          metric(
            "animationUpdate",
            "animation",
            "ms",
            percentile95(animationIntervals.map(({ start, end }) => end - start)),
            "timing",
          ),
        ]
      : [],
});
registerPerformanceContributor({
  id: "audio",
  collect: ({ page }) =>
    page.motion?.audioTracks?.length
      ? [metric("audioProcessing", "audio", "ms", null, "timing")]
      : [],
});

/** Union host intervals: a synchronous cached submission may overlap its Motion update. */
function hostWork(sample: SceneFrameSample, animation?: { start: number; end: number }) {
  const elapsed = sample.hostMs ?? 0;
  if (!animation) return elapsed;
  const animationMs = Math.max(0, animation.end - animation.start);
  const overlap =
    sample.hostStarted === null
      ? 0
      : Math.max(
          0,
          Math.min(sample.hostStarted + elapsed, animation.end) -
            Math.max(sample.hostStarted, animation.start),
        );
  return elapsed + animationMs - overlap;
}

export function compositionReport(input: PerformanceReportInput): CompositionPerformanceSnapshot {
  const { samples } = input;
  const intervals = samples.slice(1).map((sample, i) => sample.at - samples[i]!.at);
  return {
    contributions: frameContributions(samples, (sample, index) =>
      sample.hostMs === null ? null : hostWork(sample, input.animationIntervals[index]),
    ),
    compositionId: input.page.id,
    measuredAt: Date.now(),
    budgetMs: 1000 / 60,
    sampleCount: samples.length,
    durationMs: input.durationMs,
    frame: value(percentile95(intervals)),
    cpu: value(
      percentile95(
        samples.flatMap((sample, i) =>
          sample.hostMs === null ? [] : [hostWork(sample, input.animationIntervals[i])],
        ),
      ),
    ),
    gpu: value(
      percentile95(samples.flatMap((sample) => (sample.gpuMs === null ? [] : [sample.gpuMs]))),
      "unavailable",
    ),
    metrics: [...contributors.values()].flatMap((contributor) => contributor.collect(input)),
  };
}
