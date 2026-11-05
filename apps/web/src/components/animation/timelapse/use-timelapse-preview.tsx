import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  resolveOutputFraming,
  type OutputFraming,
  createTimelapseReplay,
  evaluateReplay,
  isImageAsset,
  type Composition,
  type ReplaySpec,
} from "@musart/core";
import type {
  createRenderSession,
  selectionFrameScope,
  FontResolver,
  MediaSourceResolver,
} from "@musart/render";
import {
  createReplayTiming,
  replayFrame,
  replayFrameIndex,
} from "../../../services/animation/replay-timing";
import { createSliderValue } from "../../ui/slider-value";

interface Controls {
  seek: (time: number) => void;
  play: () => void;
  pause: () => void;
  release: () => Promise<void>;
}

/** One retained GPU preview; frame requests coalesce and never enter document/React state. */
export function useTimelapsePreview(
  spec: ReplaySpec | null,
  pageId: string,
  duration: number,
  active: boolean,
  fontResolver?: FontResolver,
  mediaResolver?: MediaSourceResolver,
  selection?: readonly string[],
  autoPlay = false,
  centerSelection = false,
  framing?: OutputFraming,
) {
  const viewport = useRef<HTMLDivElement>(null);
  const slider = useMemo(() => createSliderValue([0]), []);
  const clock = useRef<HTMLOutputElement>(null);
  const controls = useRef<Controls | null>(null);
  const retiring = useRef<Promise<void>>(Promise.resolve());
  const durationRef = useRef(duration);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState<"preparing" | "ready" | "failed">("preparing");
  const [error, setError] = useState<unknown>(null);
  useLayoutEffect(() => {
    durationRef.current = duration;
    controls.current?.pause();
    controls.current?.seek(0);
  }, [duration]);
  useEffect(() => {
    if (!spec || !active) return;
    let stopped = false;
    const preparation = new AbortController();
    let renderer: ReturnType<typeof createRenderSession> | undefined;
    let crop: ReturnType<typeof selectionFrameScope> | undefined;
    let finalPage: Composition | undefined;
    let requested: number | null = null;
    let draining = false;
    let frame = 0;
    let position = 0;
    let lastRequested = -1;
    let ready = false;
    let advancing = false;
    let disposal: Promise<void> | null = null;
    const host = viewport.current;
    const images = Object.values({ ...spec.initial.assets, ...spec.assets }).filter(
      isImageAsset,
    ).length;
    // Keep most of the strict 64 MiB cache available for effects and spatial resources.
    const imageDimension = Math.max(
      1,
      Math.min(480, Math.floor(Math.sqrt((16 * 1024 * 1024) / (4 * Math.max(1, images))))),
    );
    function pause() {
      cancelAnimationFrame(frame);
      frame = 0;
      if (advancing) {
        advancing = false;
        setPlaying(false);
      }
    }
    async function drain() {
      if (draining) return;
      draining = true;
      try {
        const replay = createTimelapseReplay(spec!);
        const { createRenderSession, estimatePreviewCost } = await import("@musart/render");
        if (!renderer) {
          await retiring.current;
          if (stopped) return;
          renderer = createRenderSession({
            maxBytes: 64 * 1024 * 1024,
            fontResolver,
            mediaResolver,
          });
        }
        const final = (finalPage ??= evaluateReplay(replay, replay.duration).pages.find(
          (page) => page.id === pageId,
        ));
        if (!final) throw new Error("Replay page is missing.");
        if (!crop)
          crop = selection?.length
            ? (await import("@musart/render")).selectionFrameScope(
                final,
                selection,
                centerSelection,
              )
            : { page: final, frame: (page) => page };
        while (requested !== null && !stopped) {
          const index = requested;
          requested = null;
          const timing = createReplayTiming(durationRef.current, 30, replay.duration);
          const sample = replayFrame(timing, index);
          const project = evaluateReplay(replay, sample.historyTime);
          const page = project.pages.find((item) => item.id === pageId) ?? { ...final, layers: [] };
          const output = resolveOutputFraming(crop.page, framing);
          const scale = Math.min(1, 480 / Math.max(output.width, output.height));
          const framePage = crop.frame({ ...page, width: final.width, height: final.height });
          const cost = estimatePreviewCost(framePage, scale);
          const effectSourceScale = Math.min(
            scale,
            Math.sqrt((16 * 1024 * 1024) / Math.max(1, cost.fixedBytes)),
            480 / Math.max(1, cost.maxDimension),
          );
          await renderer.withCanvasFrame(
            framePage,
            { ...replay.assets, ...project.assets },
            (canvas) => {
              if (stopped || !host) return;
              if (canvas.parentElement !== host) host.replaceChildren(canvas);
              host.dataset.frame = String(index);
              host.dataset.historyTime = String(sample.historyTime);
              if (!ready) {
                ready = true;
                setStatus("ready");
                if (autoPlay) controls.current?.play();
              }
            },
            {
              scale,
              framing,
              imageSourceScale: scale,
              maxImageDimension: imageDimension,
              effectSourceScale,
              canRender: () => !stopped,
              signal: preparation.signal,
            },
          );
        }
      } catch (failure) {
        if (!stopped) {
          console.error("[Melt timelapse preview failed]", { pageId }, failure);
          pause();
          setError(failure);
          setStatus("failed");
          await release().catch((cleanup) =>
            console.error("[Melt timelapse cleanup failed]", cleanup),
          );
        }
      } finally {
        draining = false;
      }
    }
    function seek(time: number) {
      const timing = createReplayTiming(durationRef.current, 30, spec!.duration);
      position = Math.max(0, Math.min(timing.duration, time));
      slider.set([position]);
      if (clock.current)
        clock.current.textContent = `${position.toFixed(1)} / ${timing.duration} s`;
      const index = replayFrameIndex(timing, position);
      if (index === lastRequested) return;
      lastRequested = index;
      requested = index;
      void drain();
    }
    function release() {
      stopped = true;
      preparation.abort();
      cancelAnimationFrame(frame);
      controls.current = null;
      host?.replaceChildren();
      if (!disposal) {
        disposal = renderer?.dispose() ?? retiring.current;
        retiring.current = disposal.catch(() => {});
      }
      return disposal;
    }
    controls.current = {
      seek: (time) => {
        pause();
        seek(time);
      },
      pause,
      release,
      play: () => {
        pause();
        if (position >= durationRef.current) position = 0;
        advancing = true;
        setPlaying(true);
        const started = performance.now() - position * 1000;
        function tick(now: number) {
          if (stopped) return;
          seek((now - started) / 1000);
          if (position < durationRef.current) frame = requestAnimationFrame(tick);
          else pause();
        }
        frame = requestAnimationFrame(tick);
      },
    };
    void Promise.resolve().then(() => {
      if (stopped) return;
      setStatus("preparing");
      setError(null);
      setPlaying(false);
      seek(0);
    });
    return () => {
      void release().catch(() => {});
    };
  }, [
    spec,
    pageId,
    active,
    fontResolver,
    mediaResolver,
    slider,
    selection,
    autoPlay,
    centerSelection,
    framing,
  ]);
  return { viewport, slider, clock, status, error, playing, controls };
}
