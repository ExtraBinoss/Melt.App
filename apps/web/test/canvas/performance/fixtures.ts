import type { CompositionPerformanceSnapshot } from "../../../src/state/session/composition-performance";

export function performanceSnapshot(compositionId: string): CompositionPerformanceSnapshot {
  return {
    compositionId,
    measuredAt: 1_790_000_000_000,
    budgetMs: 1000 / 60,
    sampleCount: 8,
    durationMs: 150,
    frame: { value: 16.7, availability: "measured" },
    cpu: { value: 3.25, availability: "measured" },
    gpu: { value: null, availability: "unavailable", reason: "timestamp-query" },
    metrics: [
      {
        id: "layers",
        domain: "scene",
        kind: "inventory",
        unit: "count",
        value: 3,
        availability: "measured",
      },
      {
        id: "drawCommands",
        domain: "gpu",
        kind: "counter",
        unit: "count",
        value: 19,
        availability: "measured",
      },
      {
        id: "sourcePreparation",
        domain: "images",
        kind: "timing",
        unit: "ms",
        value: 1.5,
        availability: "measured",
      },
    ],
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
