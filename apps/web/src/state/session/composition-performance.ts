import type { EnginePort, Project } from "@musart/core";

export type CompositionPerformanceAvailability = "measured" | "unavailable" | "not-measured";
export interface CompositionPerformanceValue {
  value: number | null;
  availability: CompositionPerformanceAvailability;
  /** Diagnostic code only. Presentation uses localized availability labels. */
  reason?: string;
}
export interface CompositionPerformanceMetric extends CompositionPerformanceValue {
  id: string;
  domain: string;
  unit: "ms" | "count" | "bytes" | "percent";
  kind: "timing" | "counter" | "inventory";
}
export interface CompositionPerformanceSnapshot {
  compositionId: string;
  measuredAt: number;
  budgetMs: number;
  sampleCount: number;
  durationMs: number;
  /** Observed presentation interval, never a claimed hardware refresh rate. */
  frame: CompositionPerformanceValue;
  /** CPU elapsed time; it must not be presented as GPU execution time. */
  cpu: CompositionPerformanceValue;
  /** Only measured GPU timestamps qualify as measured GPU time. */
  gpu: CompositionPerformanceValue;
  metrics: readonly CompositionPerformanceMetric[];
  contributions?: Readonly<Record<"cpu" | "gpu", readonly { id: string; value: number }[]>>;
}
export type CompositionProfiler = (
  compositionId: string,
  signal: AbortSignal,
) => Promise<CompositionPerformanceSnapshot>;
export interface CompositionPerformancePort {
  read(this: void, compositionId: string): CompositionPerformanceSnapshot | null;
  subscribe(this: void, listener: () => void): () => void;
  request(
    this: void,
    compositionId: string,
    signal: AbortSignal,
  ): Promise<CompositionPerformanceSnapshot>;
  registerProfiler(this: void, profiler: CompositionProfiler): () => void;
}
export class CompositionPerformanceError extends Error {
  constructor(readonly code: "unavailable" | "stale" | "invalid" | "timeout") {
    super(`Composition performance: ${code}`);
    this.name = "CompositionPerformanceError";
  }
}
const sessions = new WeakMap<EnginePort, CompositionPerformancePort>();
const MAX_SNAPSHOTS = 32;
const REQUEST_TIMEOUT_MS = 8_000;
type Cached = {
  project: WeakRef<Project>;
  revision: number;
  snapshot: CompositionPerformanceSnapshot;
};

function validateValue(value: CompositionPerformanceValue): boolean {
  return (
    !!value &&
    (value.reason === undefined ||
      (typeof value.reason === "string" && value.reason.length <= 256)) &&
    (value.availability === "measured"
      ? typeof value.value === "number" && Number.isFinite(value.value) && value.value >= 0
      : (value.availability === "unavailable" || value.availability === "not-measured") &&
        value.value === null)
  );
}
function capture(value: CompositionPerformanceSnapshot, id: string) {
  if (
    !value ||
    value.compositionId !== id ||
    !Number.isFinite(value.measuredAt) ||
    value.measuredAt < 0 ||
    value.measuredAt > 8_640_000_000_000_000 ||
    !Number.isFinite(value.budgetMs) ||
    value.budgetMs <= 0 ||
    !Number.isSafeInteger(value.sampleCount) ||
    value.sampleCount < 0 ||
    !Number.isFinite(value.durationMs) ||
    value.durationMs < 0 ||
    ![value.frame, value.cpu, value.gpu].every(validateValue) ||
    !Array.isArray(value.metrics) ||
    value.metrics.length > 128 ||
    value.metrics.some(
      (metric) =>
        !validateValue(metric) ||
        typeof metric.id !== "string" ||
        !metric.id ||
        metric.id.length > 128 ||
        typeof metric.domain !== "string" ||
        !metric.domain ||
        metric.domain.length > 128 ||
        !["ms", "count", "bytes", "percent"].includes(metric.unit) ||
        !["timing", "counter", "inventory"].includes(metric.kind),
    ) ||
    new Set(value.metrics.map((metric) => `${metric.domain}:${metric.id}`)).size !==
      value.metrics.length
  )
    throw new CompositionPerformanceError("invalid");
  if (
    value.contributions &&
    (["cpu", "gpu"] as const).some((domain) => {
      const parts = value.contributions![domain];
      return (
        !Array.isArray(parts) ||
        parts.length > 64 ||
        parts.some(
          (part) =>
            !part ||
            typeof part.id !== "string" ||
            !part.id ||
            part.id.length > 128 ||
            !Number.isFinite(part.value) ||
            part.value < 0,
        ) ||
        new Set(parts.map((part) => part.id)).size !== parts.length ||
        (parts.length > 0 &&
          (value[domain].value === null ||
            Math.abs(parts.reduce((sum, part) => sum + part.value, 0) - value[domain].value!) >
              0.001))
      );
    })
  )
    throw new CompositionPerformanceError("invalid");
  const measured = (item: CompositionPerformanceValue) =>
    Object.freeze({
      value: item.value,
      availability: item.availability,
      ...(item.reason === undefined ? {} : { reason: item.reason }),
    });
  return Object.freeze({
    compositionId: value.compositionId,
    measuredAt: value.measuredAt,
    budgetMs: value.budgetMs,
    sampleCount: value.sampleCount,
    durationMs: value.durationMs,
    frame: measured(value.frame),
    cpu: measured(value.cpu),
    gpu: measured(value.gpu),
    ...(value.contributions
      ? {
          contributions: Object.freeze(
            Object.fromEntries(
              (["cpu", "gpu"] as const).map((domain) => [
                domain,
                Object.freeze(
                  value.contributions![domain].map((part) => Object.freeze({ ...part })),
                ),
              ]),
            ),
          ) as NonNullable<CompositionPerformanceSnapshot["contributions"]>,
        }
      : {}),
    metrics: Object.freeze(
      value.metrics.map((metric) =>
        Object.freeze({
          ...measured(metric),
          id: metric.id,
          domain: metric.domain,
          unit: metric.unit,
          kind: metric.kind,
        }),
      ),
    ),
  });
}

/** Engine-local, bounded presentation data. A request never edits the document. */
export function getCompositionPerformance(engine: EnginePort): CompositionPerformancePort {
  const existing = sessions.get(engine);
  if (existing) return existing;
  const listeners = new Set<() => void>();
  const cache = new Map<string, Cached>();
  let profiler: CompositionProfiler | null = null;
  let generation = 0;
  let pending: AbortController | null = null;
  let stopEngine: (() => void) | null = null;
  const emit = () => {
    for (const listener of listeners) listener();
  };
  function current(item: Cached): boolean {
    const state = engine.getSnapshot();
    return (
      state.project === item.project.deref() &&
      state.revision === item.revision &&
      state.project.pages.some((page) => page.id === item.snapshot.compositionId)
    );
  }
  function invalidate() {
    let changed = false;
    for (const [id, item] of cache)
      if (!current(item)) {
        cache.delete(id);
        changed = true;
      }
    if (changed) emit();
  }
  const port: CompositionPerformancePort = {
    read(id) {
      const item = cache.get(id);
      return item && current(item) ? item.snapshot : null;
    },
    subscribe(listener) {
      listeners.add(listener);
      if (!stopEngine) stopEngine = engine.subscribe(invalidate);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          stopEngine?.();
          stopEngine = null;
        }
      };
    },
    async request(id, signal) {
      signal.throwIfAborted();
      if (!profiler) throw new CompositionPerformanceError("unavailable");
      const provider = profiler;
      const providerGeneration = generation;
      const origin = engine.getSnapshot();
      if (!origin.project.pages.some((page) => page.id === id))
        throw new CompositionPerformanceError("stale");
      pending?.abort(new DOMException("Superseded", "AbortError"));
      const controller = new AbortController();
      pending = controller;
      const abort = () => controller.abort(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      const stop = engine.subscribe(() => {
        const state = engine.getSnapshot();
        if (state.project !== origin.project || state.revision !== origin.revision)
          controller.abort(new CompositionPerformanceError("stale"));
      });
      const timeout = setTimeout(
        () => controller.abort(new CompositionPerformanceError("timeout")),
        REQUEST_TIMEOUT_MS,
      );
      let stopAbort = () => {};
      try {
        const cancelled = new Promise<never>((_, reject) => {
          const fail = () => reject(controller.signal.reason);
          controller.signal.addEventListener("abort", fail, { once: true });
          stopAbort = () => controller.signal.removeEventListener("abort", fail);
          if (controller.signal.aborted) fail();
        });
        let provided: Promise<CompositionPerformanceSnapshot>;
        try {
          controller.signal.throwIfAborted();
          provided = provider(id, controller.signal);
        } catch (error) {
          provided = Promise.reject(error);
        }
        const result = await Promise.race([provided, cancelled]);
        controller.signal.throwIfAborted();
        if (pending !== controller || generation !== providerGeneration)
          throw new CompositionPerformanceError("stale");
        const snapshot = capture(result, id);
        const item = { project: new WeakRef(origin.project), revision: origin.revision, snapshot };
        if (!current(item)) throw new CompositionPerformanceError("stale");
        cache.delete(id);
        cache.set(id, item);
        if (cache.size > MAX_SNAPSHOTS) cache.delete(cache.keys().next().value!);
        emit();
        return snapshot;
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        stopAbort();
        stop();
        if (pending === controller) pending = null;
      }
    },
    registerProfiler(provider) {
      pending?.abort(new CompositionPerformanceError("stale"));
      const lease = ++generation;
      profiler = provider;
      cache.clear();
      emit();
      return () => {
        if (generation !== lease) return;
        generation++;
        pending?.abort(new CompositionPerformanceError("unavailable"));
        profiler = null;
        cache.clear();
        emit();
      };
    },
  };
  sessions.set(engine, port);
  return port;
}
