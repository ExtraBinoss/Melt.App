import {
  getUiPresentation,
  type UiPresentationPort,
} from "../../../../state/session/ui-presentation";
import { waitForPresentation } from "../../../../state/session/wait-for-presentation";
import { beginProjectTiming } from "../../../../services/performance/project-timing";
import { createPlaybackPipelineDiagnostics } from "../../../../services/performance/playback-pipeline";
import {
  applyMotionFrame,
  compileMotion,
  evaluateMotion,
  motionTimeToSeconds,
  type MotionTime,
  type Project,
} from "@musart/core";
import {
  BufferedPlaybackClock,
  PLAYBACK_FRAME_CREDIT_MS,
  samplePlaybackPhase,
} from "@musart/render/playback";
import type { FontResolver, MediaSourceResolver, RenderOptions } from "@musart/render";
import {
  prepareMotionTemplate,
  type PreparedMotionTemplate,
} from "../../../../services/projects/templates/motion/loader";
import type { MotionTemplateId } from "../../../../services/projects/templates/motion/model";
import { PreviewSessionPool, type PreviewSession } from "./session-pool";
import { motionTemplateSources as sources } from "../../../../services/projects/templates/motion/source-cache";

export type PreviewStatus = "idle" | "loading" | "playing" | "paused" | "failed";
type Session = PreviewSession;
export interface PreviewDependencies {
  presentation?: UiPresentationPort;
  prepare: (id: MotionTemplateId, signal: AbortSignal) => Promise<PreparedMotionTemplate>;
  createSession: (options: RenderOptions & { maxBytes: number }) => Promise<Session>;
  now: () => number;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
}
const sessions = new PreviewSessionPool(
  async (options) => {
    const { createRenderSession } = await import("@musart/render");
    return createRenderSession(options);
  },
  () => sources.clear(),
);
const native: PreviewDependencies = {
  prepare: (id, signal) => prepareMotionTemplate(id, { signal, preview: true }),
  createSession: (options) => sessions.acquire(options),
  now: () => performance.now(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
};
export interface PreviewOwner {
  release: () => Promise<void>;
  setPaused?: (paused: boolean) => void;
}
let active: PreviewOwner | null = null;
async function clearPreviews() {
  await active?.release();
  await sessions.clear();
}
if (typeof document !== "undefined") {
  const hide = () => {
    if (document.hidden) void clearPreviews().catch((error: unknown) => console.error(error));
  };
  const unload = () => {
    void clearPreviews().catch((error: unknown) => console.error(error));
  };
  document.addEventListener("visibilitychange", hide);
  window.addEventListener("pagehide", unload);
  import.meta.hot?.dispose(() => {
    document.removeEventListener("visibilitychange", hide);
    window.removeEventListener("pagehide", unload);
    unload();
  });
}

export interface MotionPreviewSource {
  readonly project: Project;
  readonly compositionId?: string;
  readonly originals?: PreparedMotionTemplate["originals"];
  readonly mediaResolver?: MediaSourceResolver;
  readonly fontResolver?: FontResolver;
}

/** One owner shared by saved projects and templates; one active frame plus one latest request. */
export function startMotionPreview(
  options: {
    label?: string;
    prepare: (signal: AbortSignal) => Promise<MotionPreviewSource>;
    host: HTMLElement;
    onStatus: (status: PreviewStatus, error?: unknown) => void;
  },
  dependencies: Omit<PreviewDependencies, "prepare"> = native,
): PreviewOwner {
  const presentation =
    dependencies.presentation ?? (dependencies === native ? getUiPresentation() : undefined);
  const timing = beginProjectTiming(options.label ?? "Hover preview");
  const previous = active;
  const abort = new AbortController();
  let stopped = false;
  let session: Session | null = null;
  const diagnostics = createPlaybackPipelineDiagnostics(
    options.label ?? "Library",
    () => session?.stats?.() ?? null,
  );
  let frame: number | null = null;
  let requested: MotionTime | null = null;
  let draining: Promise<void> | null = null;
  let disposal: Promise<void> | null = null;
  const clock = new BufferedPlaybackClock(dependencies.now);
  let stopPresentation: (() => void) | undefined;
  let presentationRelease: (() => boolean) | null = null;
  let paused = false;
  let renderGeneration = 0;
  let changePaused: ((next: boolean) => void) | null = null;
  let lastSample = -1;
  let bootstrap: Promise<void> = Promise.resolve();
  function alive() {
    return !stopped && active === owner && !abort.signal.aborted;
  }
  function stop(notify: boolean): Promise<void> {
    if (disposal) return disposal;
    timing?.finish("cancelled");
    stopped = true;
    clock.stop();
    diagnostics?.dispose();
    stopPresentation?.();
    abort.abort();
    if (frame !== null) dependencies.cancelFrame(frame);
    frame = null;
    requested = null;
    options.host.replaceChildren();
    if (notify) options.onStatus("idle");
    disposal = (async () => {
      try {
        await bootstrap;
        await draining;
        await session?.dispose();
      } finally {
        if (active === owner) active = null;
      }
    })();
    return disposal;
  }
  const owner: PreviewOwner = {
    release: () => stop(true),
    setPaused: (next) => changePaused?.(next),
  };
  active = owner;
  options.onStatus("loading");
  bootstrap = (async () => {
    try {
      timing?.stage("Release previous preview");
      await previous?.release();
      abort.signal.throwIfAborted();
      timing?.stage("Read + validate preview source");
      if (presentation?.busy()) await waitForPresentation(presentation, abort.signal);
      const source = await options.prepare(abort.signal);
      abort.signal.throwIfAborted();
      const prepared =
        dependencies === native ? { ...source, project: sources.retain(source.project) } : source;
      timing?.identify(prepared.project.name);
      abort.signal.throwIfAborted();
      const page = prepared.compositionId
        ? prepared.project.pages.find((item) => item.id === prepared.compositionId)
        : prepared.project.pages[0];
      if (!page) throw new Error("The saved Motion preview artboard is no longer available.");
      timing?.stage("Compile animation");
      if (presentation?.busy()) await waitForPresentation(presentation, abort.signal);
      const program =
        dependencies === native
          ? sources.compile(prepared.project, page.id)
          : compileMotion(prepared.project, { compositionId: page.id });
      if (program.mode !== "motion" || !program.duration)
        throw new Error("The preview does not contain a Motion composition.");
      const duration = program.duration;
      const mediaResolver: MediaSourceResolver = prepared.mediaResolver ?? {
        resolveOriginal: async (asset, request) => {
          abort.signal.throwIfAborted();
          request?.signal?.throwIfAborted();
          const original = prepared.originals?.find(
            (item) =>
              item.originalId === asset.originalId &&
              item.contentRevision === asset.contentRevision,
          );
          if (!original) throw new Error("The preview video original is missing.");
          return original.blob;
        },
      };
      timing?.stage("Acquire GPU preview session (reuse when compatible)");
      if (presentation?.busy()) await waitForPresentation(presentation, abort.signal);
      session = await dependencies.createSession({
        maxBytes: 128 * 1024 * 1024,
        fontResolver: prepared.fontResolver,
        mediaResolver,
        mediaMode: "playback",
        signal: abort.signal,
      });
      abort.signal.throwIfAborted();
      const bounds = options.host.getBoundingClientRect();
      const displayScale =
        bounds.width > 0 && bounds.height > 0
          ? Math.min(bounds.width / page.width, bounds.height / page.height) *
            Math.min(2, globalThis.devicePixelRatio || 1)
          : Infinity;
      const scale = Math.min(1, 480 / Math.max(page.width, page.height), displayScale);
      async function render(time: MotionTime) {
        const started = diagnostics ? performance.now() : 0;
        const generation = renderGeneration;
        if (presentation?.busy()) await waitForPresentation(presentation, abort.signal);
        if (!alive() || paused || generation !== renderGeneration) return;
        const plan = evaluateMotion(program, time);
        const releaseFrame = clock.hold(PLAYBACK_FRAME_CREDIT_MS);
        try {
          await session!.withCanvasFrame(
            applyMotionFrame(program, plan),
            prepared.project.assets,
            (canvas) => {
              if (!alive() || paused || generation !== renderGeneration) return;
              if (canvas.parentElement !== options.host) options.host.replaceChildren(canvas);
              options.host.dataset.previewTime = String(motionTimeToSeconds(plan.time));
              if (import.meta.env.DEV && typeof performance.mark === "function") {
                performance.mark("Melt frame: preview-submit", {
                  detail: {
                    compositionId: program.compositionId,
                    projectId: prepared.project.id,
                    playing: true,
                    time: plan.time,
                  },
                });
                performance.clearMarks("Melt frame: preview-submit");
              }
            },
            {
              scale,
              motionFrame: plan,
              mediaResolver,
              mediaMode: "playback",
              traceFrames: import.meta.env.DEV,
              profileVideo: import.meta.env.DEV,
              signal: abort.signal,
              canRender: () => alive() && !paused && generation === renderGeneration,
            },
          );
          if (alive() && !paused && generation === renderGeneration)
            diagnostics?.record(plan, started, {
              projectId: prepared.project.id,
              name: prepared.project.name,
            });
        } catch (error) {
          // A queued/in-flight frame rejected by pause is expected admission cancellation.
          // Never hide actual preparation, decoding or GPU failures.
          if (
            generation !== renderGeneration &&
            error instanceof Error &&
            error.name === "AbortError"
          )
            return;
          throw error;
        } finally {
          releaseFrame();
        }
      }
      function failure(error: unknown) {
        if (!alive()) return;
        options.onStatus("failed", error);
        void stop(false).catch((cleanupError) => options.onStatus("failed", cleanupError));
      }
      function drain() {
        if (draining || !alive() || paused) return;
        draining = (async () => {
          while (requested !== null && alive() && !paused) {
            const sample = requested;
            requested = null;
            await render(sample);
          }
        })()
          .catch(failure)
          .finally(() => {
            draining = null;
            schedule();
          });
      }
      function schedule() {
        if (alive() && !paused && !draining && !clock.blocked && frame === null)
          frame = dependencies.requestFrame(tick);
      }
      function tick() {
        frame = null;
        if (!alive() || paused || clock.blocked) return;
        const { time } = samplePlaybackPhase(clock.read(), duration);
        if (time.value !== lastSample) {
          lastSample = time.value;
          requested = time;
          drain();
        } else schedule();
      }
      timing?.stage("First frame: fonts, geometry + GPU render");
      await render({ value: 0, rate: 1 });
      if (!alive()) return;
      changePaused = (next) => {
        if (!alive() || paused === next) return;
        paused = next;
        if (next) {
          diagnostics?.pause();
          clock.stop();
          presentationRelease = null;
          renderGeneration++;
          if (frame !== null) dependencies.cancelFrame(frame);
          frame = null;
          requested = null;
          options.onStatus("paused");
        } else {
          clock.start(clock.read());
          if (presentation?.busy()) presentationRelease = clock.hold();
          lastSample = -1;
          options.onStatus("playing");
          schedule();
        }
      };
      clock.start(0);
      stopPresentation = presentation?.subscribe(() => {
        if (!alive() || paused) return;
        if (presentation.busy()) {
          presentationRelease ??= clock.hold();
          renderGeneration++;
          lastSample = -1;
          if (frame !== null) dependencies.cancelFrame(frame);
          frame = null;
        } else {
          presentationRelease?.();
          presentationRelease = null;
          schedule();
        }
      });
      if (presentation?.busy()) presentationRelease = clock.hold();
      options.onStatus("playing");
      timing?.finish("ready");
      lastSample = 0;
      schedule();
    } catch (error) {
      if (alive()) {
        timing?.finish("failed", error);
        options.onStatus("failed", error);
        // Queue cleanup after bootstrap resolves rather than awaiting ourselves.
        queueMicrotask(() => {
          void stop(false).catch((failure) => options.onStatus("failed", failure));
        });
      }
    }
  })();
  return owner;
}

/** Authored templates use the same global GPU admission as saved-project previews. */
export function startMotionTemplatePreview(
  options: {
    templateId: MotionTemplateId;
    host: HTMLElement;
    onStatus: (status: PreviewStatus, error?: unknown) => void;
  },
  dependencies: PreviewDependencies = native,
): PreviewOwner {
  return startMotionPreview(
    {
      ...options,
      label: `Hover template ${options.templateId}`,
      prepare: (signal) => dependencies.prepare(options.templateId, signal),
    },
    dependencies,
  );
}
