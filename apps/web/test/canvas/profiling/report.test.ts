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
