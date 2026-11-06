import { usesVideoSources } from "../../renderer/video-backend";
import { selectionFrameScope } from "./selection";
import {
  resolveOutputFraming,
  applyMotionFrame,
  compileMotion,
  evaluateMotion,
  motionTimeToSeconds,
  normalizeMotionTime,
  type MotionTime,
  type Project,
} from "@musart/core";
import { createRenderSession } from "../standalone";
import { compositionVideoTiming } from "./timing";
import { MotionExportError } from "./errors";
import type { MotionPreviewOptions, MotionPreviewState } from "./preview-model";
import { BufferedPlaybackClock, PLAYBACK_FRAME_CREDIT_MS } from "../../playback";

/** The shared buffered clock and one acknowledged GPU job; no editor/history dependency. */
export function createMotionPreview(project: Project, options: MotionPreviewOptions) {
  const assets = structuredClone(project.assets);
  const program = compileMotion({ ...project, assets }, { compositionId: options.compositionId });
  const timing = compositionVideoTiming(program, options);
  const selection = selectionFrameScope(
    program.composition,
    options.selection,
    options.centerSelection,
  );
  const edge = options.edge ?? 768;
  if (!Number.isInteger(edge) || edge < 16 || edge > 768)
    throw new MotionExportError("invalidOptions", "Motion preview edge must be 16–768 pixels.");
  const output = resolveOutputFraming(selection.page, options.framing);
  const previewScale = Math.min(1, edge / Math.max(output.width, output.height));
  const scheduler = options.scheduler ?? {
    now: () => performance.now(),
    request: (callback: () => void) => requestAnimationFrame(callback),
    cancel: (handle: number) => cancelAnimationFrame(handle),
  };
  const duration = motionTimeToSeconds(timing.duration);
  const frameRate = Math.min(30, timing.frameRate.numerator / timing.frameRate.denominator);
  const session = createRenderSession({
    mediaResolver: options.mediaResolver,
    fontResolver: options.fontResolver,
    forceWebGL: options.forceWebGL,
    videoSources: usesVideoSources(program.composition),
    maxBytes: options.maxGpuBytes ?? 256 * 1024 * 1024,
  });
  const abort = new AbortController(),
    listeners = new Set<() => void>();
  const clock = new BufferedPlaybackClock(() => scheduler.now());
  clock.start(0);
  let bootstrapRelease: (() => boolean) | null = clock.hold();
  let presentationRelease: (() => boolean) | null = options.presentation?.busy()
    ? clock.hold()
    : null;
  let state: MotionPreviewState = {
    playing: true,
    time: { value: 0, rate: 1 },
    duration: timing.duration,
    busy: false,
    error: null,
  };
  let frame: number | null = null,
    pending: Promise<void> | null = null;
  let staticPresented = false;
  let generation = 0,
    dirty = true,
    closed = false;
  let disposal: Promise<void> | null = null;
  const publish = (next: Partial<MotionPreviewState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };
  const sample = (seconds: number) =>
    normalizeMotionTime({ value: Math.round(seconds * 1_000_000), rate: 1_000_000 });
  const schedule = () => {
    if (
      !closed &&
      !state.error &&
      !options.presentation?.busy() &&
      frame === null &&
      !pending &&
      ((state.playing && !clock.blocked) || dirty)
    )
      frame = scheduler.request(() => {
        frame = null;
        paint();
      });
  };
  const paint = () => {
    if (closed || pending || state.error || options.presentation?.busy()) return;
    const seconds =
      state.playing && !clock.blocked
        ? Math.floor((clock.read() % duration) * frameRate + 1e-7) / frameRate
        : motionTimeToSeconds(state.time);
    const owner = generation,
      time = sample(seconds);
    if (!dirty && time.value === state.time.value && time.rate === state.time.rate) {
      schedule();
      return;
    }
    if (program.mode === "static" && staticPresented && !dirty) {
      publish({ time });
      schedule();
      return;
    }
    const plan = evaluateMotion(program, program.mode === "static" ? { value: 0, rate: 1 } : time);
    const releaseFrame = clock.hold(bootstrapRelease ? 0 : PLAYBACK_FRAME_CREDIT_MS);
    dirty = false;
    publish({ busy: true });
    const job = session.withCanvasFrame(
      selection.frame(applyMotionFrame(program, plan)),
      assets,
      (canvas) => {
        if (!closed && owner === generation) {
          staticPresented = true;
          options.onFrame(canvas, session.stats()?.backend);
        }
      },
      {
        scale: previewScale,
        framing: options.framing,
        vectorAntialias: true,
        motionFrame: plan,
        mediaMode: state.playing ? "playback" : "preview",
        signal: abort.signal,
        canRender: () => !closed && owner === generation,
      },
    );
    pending = job
      .then(
        () => {
          if (closed || owner !== generation) return;
          publish({ time, busy: false });
          bootstrapRelease?.();
          bootstrapRelease = null;
        },
        (error: unknown) => {
          if (!closed && owner === generation) {
            clock.stop();
            publish({ playing: false, busy: false, error });
          }
        },
      )
      .finally(() => {
        releaseFrame();
        pending = null;
        if (state.error && !closed) {
          disposal ??= session.dispose();
          void disposal.catch((cleanup: unknown) => {
            if (!closed)
              publish({
                error: new AggregateError([state.error, cleanup], "Motion preview cleanup failed."),
              });
          });
        }
        schedule();
      });
  };
  const stopPresentation = options.presentation?.subscribe(() => {
    if (closed) return;
    if (options.presentation?.busy()) {
      presentationRelease ??= clock.hold();
      generation++;
      dirty = true;
      if (frame !== null) scheduler.cancel(frame);
      frame = null;
    } else {
      presentationRelease?.();
      presentationRelease = null;
      schedule();
    }
  });
  schedule();
  return {
    read: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    holdPlayback() {
      if (closed || !state.playing) return () => {};
      const release = clock.hold();
      return (delayMs = 0) => {
        if (release(delayMs)) schedule();
      };
    },
    play() {
      if (closed || state.error || state.playing) return;
      clock.start(motionTimeToSeconds(state.time));
      presentationRelease = options.presentation?.busy() ? clock.hold() : null;
      publish({ playing: true });
      schedule();
    },
    pause() {
      if (closed || !state.playing) return;
      clock.stop(motionTimeToSeconds(state.time));
      bootstrapRelease = presentationRelease = null;
      generation++;
      dirty = true;
      publish({ playing: false });
      schedule();
    },
    seek(time: MotionTime) {
      if (closed || state.error) return;
      const seconds = Math.max(
        0,
        Math.min(duration, motionTimeToSeconds(normalizeMotionTime(time))),
      );
      generation++;
      clock.stop(seconds);
      bootstrapRelease = presentationRelease = null;
      if (state.playing) {
        clock.start(seconds);
        presentationRelease = options.presentation?.busy() ? clock.hold() : null;
      }
      dirty = true;
      publish({ time: sample(seconds) });
      schedule();
    },
    dispose() {
      if (!closed) {
        closed = true;
        stopPresentation?.();
        clock.stop();
        generation++;
        abort.abort();
        if (frame !== null) scheduler.cancel(frame);
        frame = null;
        listeners.clear();
      }
      disposal ??= (async () => {
        await pending;
        await session.dispose();
      })();
      return disposal;
    },
  };
}
