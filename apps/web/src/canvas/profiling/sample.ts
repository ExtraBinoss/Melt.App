import {
  frameTime,
  motionTimeToSeconds,
  compareMotionTime,
  type Composition,
  type EnginePort,
  type MotionTime,
} from "@musart/core";
import { performanceEnvironment } from "./environment";
import { canvasNativeRenderer, canvasProfileSource } from "../render/plane-resources";
import type { SceneFrameSample } from "../render/scene-profile-source";
import { createMotionTransport } from "../../services/motion/transport";
import { CompositionPerformanceError } from "../../state/session/composition-performance";
import { compositionReport } from "./report";

function nextFrame(signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      cancelAnimationFrame(frame);
      reject(signal.reason);
    };
    const frame = requestAnimationFrame(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    });
    signal.addEventListener("abort", abort, { once: true });
  });
}
async function readyCanvas(read: () => HTMLCanvasElement | null, id: string, signal: AbortSignal) {
  for (let attempt = 0; attempt < 240; attempt++) {
    signal.throwIfAborted();
    const canvas = read();
    if (
      canvas?.dataset.pageId === id &&
      canvas.dataset.rendererReady === "true" &&
      canvas.dataset.sceneRevision === canvas.dataset.renderedRevision
    )
      return canvas;
    await nextFrame(signal);
  }
  throw new CompositionPerformanceError("timeout");
}
function sampleTime(page: Composition, index: number, start: MotionTime) {
  const motion = page.motion!;
  const frames =
    (motionTimeToSeconds(motion.duration) * motion.frameRate.numerator) /
    motion.frameRate.denominator;
  return frameTime(
    Math.max(
      0,
      Math.min(
        Math.ceil(frames) - 1,
        Math.floor(
          (motionTimeToSeconds(start) * motion.frameRate.numerator) / motion.frameRate.denominator,
        ) + index,
      ),
    ),
    motion.frameRate,
  );
}

/** Twelve real presented poses, one pending frame/query at a time. Never starts audible playback. */
export async function sampleComposition(
  engine: EnginePort,
  read: () => HTMLCanvasElement | null,
  compositionId: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const origin = engine.getSnapshot();
  const page = origin.project.pages.find((item) => item.id === compositionId);
  if (!page) throw new CompositionPerformanceError("stale");
  if (origin.pageId !== compositionId) engine.setPage(compositionId);
  const owns = () => {
    const current = engine.getSnapshot();
    return current.project === origin.project && current.pageId === compositionId;
  };
  await nextFrame(signal);
  await nextFrame(signal);
  const canvas = await readyCanvas(read, compositionId, signal);
  const resource = canvasProfileSource(canvas);
  if (!resource) throw new CompositionPerformanceError("unavailable");
  const transport = createMotionTransport(engine);
  const initial = transport.read();
  const initialPose = initial.time;
  transport.pause();
  let expectedTime = initialPose;
  const samples: SceneFrameSample[] = [],
    animationIntervals: { start: number; end: number }[] = [];
  let waiting: { resolve(sample: SceneFrameSample): void; reject(reason: unknown): void } | null =
    null;
  let close = () => {};
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    if (
      owns() &&
      transport.read().compositionId === compositionId &&
      !transport.read().playing &&
      compareMotionTime(transport.read().time, expectedTime) === 0
    ) {
      transport.seek(initialPose);
      if (initial.playing && !document.hidden) transport.play();
    }
  };
  const abort = () => {
    close();
    restore();
    waiting?.reject(signal.reason);
    waiting = null;
  };
  signal.addEventListener("abort", abort, { once: true });
  let minimumRevision = 0;
  const listen = (sample: SceneFrameSample) => {
    if (sample.compositionId !== compositionId || sample.revision < minimumRevision || !waiting)
      return;
    const current = waiting;
    waiting = null;
    current.resolve(sample);
  };
  const started = performance.now();
  let uploadsBefore = 0,
    hitsBefore = 0;
  try {
    close = resource.source.open(listen);
    for (let index = 0; index < 12; index++) {
      signal.throwIfAborted();
      if (!owns()) throw new CompositionPerformanceError("stale");
      await nextFrame(signal);
      const before = performance.now();
      if (page.motion?.mode === "motion") {
        if (
          transport.read().playing ||
          compareMotionTime(transport.read().time, expectedTime) !== 0
        )
          throw new CompositionPerformanceError("stale");
        expectedTime = sampleTime(page, index, initialPose);
        transport.seek(expectedTime);
      }
      animationIntervals.push({ start: before, end: performance.now() });
      const pending = new Promise<SceneFrameSample>((resolve, reject) => {
        waiting = { resolve, reject };
      });
      const revision = resource.force();
      if (revision === undefined) throw new CompositionPerformanceError("unavailable");
      minimumRevision = revision;
      const sample = await pending;
      if (!owns()) throw new CompositionPerformanceError("stale");
      if (!samples.length) {
        uploadsBefore = sample.stats?.uploads ?? 0;
        hitsBefore = sample.stats?.cacheHits ?? 0;
      }
      samples.push(sample);
    }
    return compositionReport({
      environment: performanceEnvironment(canvas, canvasNativeRenderer(canvas)),
      page,
      samples,
      durationMs: performance.now() - started,
      animationIntervals,
      uploadsBefore,
      hitsBefore,
    });
  } finally {
    signal.removeEventListener("abort", abort);
    waiting = null;
    close();
    // Input cancellation restores synchronously, before the next editor gesture begins.
    restore();
  }
}
