import { expect, test } from "vitest";
import { createPage } from "@musart/core";
import {
  compositionReport,
  percentile95,
  registerPerformanceContributor,
} from "../../../src/canvas/profiling/report";
import type { SceneFrameSample } from "../../../src/canvas/render/scene-profile-source";

test("budget inputs use real work percentiles, keep cadence separate and admit extensions", () => {
  const sample = (at: number, hostMs: number, gpuMs: number | null): SceneFrameSample => ({
    compositionId: "page",
    revision: at,
    at,
    hostMs,
    hostStarted: at - hostMs,
    gpuMs,
    gpuPasses: { video: 0.5, "effects/ascii": 0.25, display: 0.25 },
    drawCommands: 3,
    stats: null,
    passes: 2,
    phases: { pipeline: 0, sources: 0, text: 0, compose: hostMs },
  });
  const remove = registerPerformanceContributor({
    id: "test-work",
    collect: () => [
      {
        id: "work",
        domain: "extension",
        unit: "count",
        kind: "counter",
        value: 7,
        availability: "measured",
      },
    ],
  });
  try {
    const report = compositionReport({
      page: createPage({ id: "page" }),
      samples: [sample(10, 2, null), sample(43, 3, 1)],
      durationMs: 33,
      animationIntervals: [
        { start: 0, end: 1 },
        { start: 10, end: 12 },
      ],
      uploadsBefore: 0,
      hitsBefore: 0,
    });
    expect(report.metrics.find((metric) => metric.id === "gpuPass:effects/ascii")?.value).toBe(
      0.25,
    );
    expect(report.frame.value).toBe(33);
    expect(report.cpu.value).toBe(5);
    expect(report.gpu).toEqual({ availability: "measured", value: 1 });
    expect(report.metrics.find((metric) => metric.id === "composition")?.domain).toBe("scene");
    expect(report.metrics.find((metric) => metric.id === "work")?.value).toBe(7);
    expect(() => registerPerformanceContributor({ id: "test-work", collect: () => [] })).toThrow();
  } finally {
    remove();
  }
  expect(percentile95([NaN, -2])).toBeNull();
});

test("overlapping synchronous Motion and renderer preparation are counted once", () => {
  const report = compositionReport({
    page: createPage({
      id: "page",
      motion: {
        version: 1,
        initialized: true,
        mode: "motion",
        tracks: [],
        duration: { value: 1, rate: 1 },
        frameRate: { numerator: 30, denominator: 1 },
      },
    }),
    samples: [
      {
        compositionId: "page",
        revision: 1,
        at: 15,
        hostStarted: 10,
        hostMs: 5,
        gpuMs: null,
        gpuPasses: null,
        drawCommands: 1,
        stats: null,
        passes: 0,
        phases: { pipeline: 0, sources: 0, text: 0, compose: 0 },
      },
    ],
    durationMs: 15,
    animationIntervals: [{ start: 8, end: 12 }],
    uploadsBefore: 0,
    hitsBefore: 0,
  });
  expect(report.cpu.value).toBe(7);
  expect(report.metrics.find((metric) => metric.id === "animationUpdate")?.value).toBe(4);
  expect(report.frame.value).toBeNull();
  expect(report.gpu.availability).toBe("unavailable");
});

test("exposes text cache, retained contour complexity and opt-in host timings separately from GPU morph time", () => {
  const report = compositionReport({
    page: createPage(),
    durationMs: 20,
    animationIntervals: [],
    uploadsBefore: 0,
    hitsBefore: 0,
    samples: [
      {
        compositionId: "page",
        revision: 1,
        at: 20,
        hostMs: 2,
        hostStarted: 18,
        gpuMs: 1,
        gpuPasses: { morph: 0.7 },
        drawCommands: 2,
        passes: 2,
        phases: { pipeline: 0, sources: 0, text: 0.1, compose: 1.9 },
        stats: {
          passes: 2,
          readbacks: 0,
          uploads: 1,
          targets: 2,
          cacheBytes: 4096,
          frames: 1,
          cacheHits: 1,
          vectorParses: 0,
          maxBytes: 100000,
          text: {
            cacheHits: 20,
            rebuilds: 1,
            shapings: 1,
            compilations: 1,
            draws: 20,
            morphUpdates: 20,
            glyphs: 0,
            morphShapes: 4,
            morphStates: 268,
            morphSegments: 185,
            maxBandCurves: 90,
            atlasBytes: 4096,
            profile: { shaping: [0.3], atlas: [10], update: [0.01, 0.02], draw: [0.2, 0.3] },
          },
        },
      },
    ],
  });
  expect(report.metrics.find((m) => m.id === "text:morphSegments")).toMatchObject({
    domain: "text",
    kind: "inventory",
    value: 185,
  });
  expect(report.metrics.find((m) => m.id === "text:rebuilds")?.value).toBe(1);
  expect(report.metrics.find((m) => m.id === "textPhase:atlas")?.value).toBe(10);
  expect(report.metrics.find((m) => m.id === "textPhase:draw")?.value).toBe(0.3);
  expect(report.metrics.find((m) => m.id === "gpuPass:morph")?.value).toBe(0.7);
});
