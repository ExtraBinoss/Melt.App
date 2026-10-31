import { afterEach, expect, test, vi } from "vitest";
import type { MotionFramePlan } from "@musart/core";
import type { GpuStats } from "@musart/render";
import {
  PlaybackPipelineDiagnostics,
  createPlaybackPipelineDiagnostics,
} from "../../../src/services/performance/playback-pipeline";

afterEach(() => vi.unstubAllEnvs());
const plan = (id = "scene") =>
  ({ compositionId: id, time: { value: 1, rate: 1 } }) as MotionFramePlan;
const stats = (frames: number): GpuStats => ({
  frames,
  passes: frames * 3,
  readbacks: 0,
  uploads: 1,
  targets: 3,
  cacheBytes: 1000,
  maxBytes: 2000,
  cacheHits: frames * 2,
  vectorParses: 0,
  profile: { pipeline: [1], sources: [2], text: [0], compose: [5] },
});

test("reports a separate first frame, then aggregates active preparation without per-frame stats reads", () => {
  let now = 100,
    frames = 1;
  const log = vi.fn(),
    read = vi.fn(() => stats(frames));
  const d = new PlaybackPipelineDiagnostics("Canvas", read, log, () => now);
  d.record(plan(), 10);
  expect(log).toHaveBeenCalledWith(expect.objectContaining({ stage: "first-frame", frameMs: 90 }));
  for (let i = 1; i <= 120; i++) {
    now = 100 + i * 20;
    frames++;
    d.record(plan(), now - 8);
  }
  expect(read).toHaveBeenCalledTimes(2);
  expect(log).toHaveBeenCalledTimes(2);
  expect(log.mock.calls[1]![0]).toMatchObject({
    surface: "Canvas",
    stage: "playback",
    windowMs: 2000,
    completedPreparationsPerSecond: 50,
    frameMs: { p50: 8, p95: 8, max: 8 },
    drawIntervalMs: { p50: 20, p95: 20, max: 20 },
    preparationPhasesMs: { compose: { p95: 5 } },
    gpu: { passes: 300, cacheHits: 200, cacheBytes: 1000 },
  });
  d.dispose();
});

test("retains long stalls in reports and resets deliberately for pause or another composition", () => {
  let now = 10;
  const log = vi.fn();
  const d = new PlaybackPipelineDiagnostics(
    "Library",
    () => null,
    log,
    () => now,
  );
  d.record(plan(), 0);
  now = 3010;
  d.record(plan(), 20);
  expect(log.mock.calls[1]![0]).toMatchObject({
    stage: "playback",
    frameMs: { max: 2990 },
    slowestPose: { frameMs: 2990 },
  });
  d.pause();
  now += 5000;
  d.record(plan(), now - 10);
  expect(log.mock.calls[2]![0]).toMatchObject({ stage: "first-frame", frameMs: 10 });
  d.record(plan("other"), now - 1);
  expect(log.mock.calls[3]![0]).toMatchObject({ compositionId: "other", stage: "first-frame" });
  d.dispose();
  d.record(plan(), 0);
  expect(log).toHaveBeenCalledTimes(4);
});

test("production installs no reporter or observer", () => {
  vi.stubEnv("DEV", false);
  const read = vi.fn();
  expect(createPlaybackPipelineDiagnostics("Canvas", read)).toBeNull();
  expect(read).not.toHaveBeenCalled();
});
