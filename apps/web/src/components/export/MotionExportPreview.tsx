import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { selectionComposition, type Composition, type Project } from "@musart/core";
import { PreviewPreparation } from "./PreviewPreparation";
import { PreviewAudio } from "../../services/motion/audio/preview";
import { MediaPlayer } from "../shared/player/MediaPlayer";
import type { createMotionPreview } from "@musart/render";
import type { EditorServices } from "../../state/contracts";
import { createSliderValue } from "../ui/slider-value";

/** Canvas ownership and clock updates stay local; React sees only play/error transitions. */
export function MotionExportPreview({
  project,
  page,
  services,
  paused = false,
  onReady,
  selection,
  centerSelection = false,
}: {
  project: Project;
  page: Composition;
  services: EditorServices;
  paused?: boolean;
  selection?: readonly string[];
  centerSelection?: boolean;
  onReady?: (preview: ReturnType<typeof createMotionPreview> | null) => void;
}) {
  const { t } = useTranslation("exportPanel");
  const host = useRef<HTMLDivElement>(null);
  const [slider] = useState(() => createSliderValue([0]));
  const [monitor, setMonitor] = useState<PreviewAudio | undefined>();
  const source = useRef<ReturnType<typeof createMotionPreview> | null>(null);
  const pauseRequested = useRef(paused);
  const owner = useMemo(
    () => ({ project, page, selection, centerSelection }),
    [project, page, selection, centerSelection],
  );
  const [playing, setPlaying] = useState(true);
  const [presentation, setPresentation] = useState<{
    owner: object;
    status: "ready" | "failed";
  } | null>(null);
  const failed = presentation?.owner === owner && presentation.status === "failed";
  const ready = presentation?.owner === owner && presentation.status === "ready";
  useEffect(() => {
    if (paused) return;
    let presented = false;
    let active = true,
      preview: ReturnType<typeof createMotionPreview> | undefined;
    let stop: (() => void) | undefined, managed: ReturnType<typeof createMotionPreview> | undefined;
    let audio: PreviewAudio | undefined,
      shownPlaying = true;
    const hidden = () => {
      if (document.hidden) preview?.pause();
    };
    void import("@musart/render")
      .then(({ createMotionPreview }) => {
        if (!active) return;
        preview = createMotionPreview(project, {
          compositionId: page.id,
          selection,
          centerSelection,
          edge: 768,
          mediaResolver: services.mediaResolverFor?.(project.id),
          fontResolver: services.fonts?.resolve,
          onFrame(canvas, backend) {
            if (backend) canvas.dataset.backend = backend;
            if (active && host.current && canvas.parentElement !== host.current)
              host.current.replaceChildren(canvas);
            if (active && !presented) {
              presented = true;
              setPresentation({ owner, status: "ready" });
            }
          },
        });
        source.current = preview;
        let monitored = project;
        if (selection?.length) {
          const selected = selectionComposition(page, selection);
          const ids = new Set(selected.layers.map((layer) => layer.id));
          monitored = {
            ...project,
            pages: [
              {
                ...selected,
                motion: {
                  ...page.motion!,
                  tracks: page.motion!.tracks.filter((track) => ids.has(track.layerId)),
                  audioTracks: [],
                },
              },
            ],
          };
        }
        const monitoredPage = monitored.pages.find((item) => item.id === page.id)!;
        if (
          monitoredPage.layers.some((layer) => layer.kind === "video") ||
          monitoredPage.motion?.audioTracks?.length
        ) {
          audio = new PreviewAudio({
            source: () => ({ project: monitored, pageId: page.id }),
            read: () => preview!.read(),
            subscribe: (listener) => preview!.subscribe(listener),
            holdPlayback: () => preview!.holdPlayback(),
            pause: () => preview!.pause(),
            resolver: () => {
              const resolver = services.mediaResolverFor?.(project.id);
              if (!resolver) throw new Error("Audio originals are unavailable.");
              return resolver;
            },
            onError: () => {
              if (active) setPresentation({ owner, status: "failed" });
            },
          });
        }
        setMonitor(audio);
        managed = {
          ...preview,
          dispose: async () => {
            const results = await Promise.allSettled([audio?.dispose(), preview!.dispose()]);
            const errors = results.filter((result) => result.status === "rejected");
            if (errors.length)
              throw new AggregateError(
                errors.map((result) => result.reason),
                "Preview cleanup failed.",
              );
          },
        };
        onReady?.(managed);
        const paint = () => {
          if (!active || !preview) return;
          const state = preview.read(),
            seconds = state.time.value / state.time.rate;
          slider.set([seconds]);
          if (state.playing !== shownPlaying) {
            shownPlaying = state.playing;
            setPlaying(state.playing);
          }
          if (state.error) setPresentation({ owner, status: "failed" });
        };
        stop = preview.subscribe(paint);
        if (pauseRequested.current) preview.pause();
        document.addEventListener("visibilitychange", hidden);
        paint();
        hidden();
      })
      .catch(() => {
        if (active) setPresentation({ owner, status: "failed" });
      });
    return () => {
      active = false;
      stop?.();
      document.removeEventListener("visibilitychange", hidden);
      if (source.current === preview) source.current = null;
      onReady?.(null);
      if (managed) void managed.dispose().catch(() => {});
      else if (preview) void preview.dispose().catch(() => {});
    };
  }, [project, page, services, paused, onReady, slider, selection, centerSelection, owner]);
  useEffect(() => {
    pauseRequested.current = paused;
    if (paused) source.current?.pause();
  }, [paused]);
  const duration = page.motion!.duration.value / page.motion!.duration.rate;
  return (
    <div className="motion-export-preview">
      <div
        className="motion-export-preview-surface"
        aria-label={t("preview")}
        data-preview-ready={ready}
        aria-busy={!ready && !failed}
      >
        <div ref={host} className="export-preview-pixels" />
        <PreviewPreparation
          ready={ready}
          failed={failed}
          label={t("preparing")}
          failure={t("failed")}
        />
      </div>
      <MediaPlayer
        identity={project}
        position={slider}
        duration={duration}
        playing={playing}
        disabled={failed || paused || !ready}
        onPlayingChange={(value) => {
          if (value) source.current?.play();
          else source.current?.pause();
        }}
        onSeek={(seconds) =>
          source.current?.seek({ value: Math.round(seconds * 1_000_000), rate: 1_000_000 })
        }
        audio={monitor}
        audioContext="artboard"
      />
    </div>
  );
}
