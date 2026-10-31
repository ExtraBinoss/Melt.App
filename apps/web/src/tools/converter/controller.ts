import { PreviewAudio } from "../../services/motion/audio/preview";
import type { Effect } from "@musart/core";
import { beginProjectTiming } from "../../services/performance/project-timing";
import { ToolDocument } from "./model";
import { prepareToolSource } from "./media";
import { ToolRenderer } from "./renderer";
import type { ToolDefinition } from "../catalog";
import type { ImageOutput, ToolRenderApi, ToolState, VideoOutput } from "./types";
let apiPromise: Promise<ToolRenderApi> | undefined;
function loadApi() {
  return (apiPromise ??= import("@musart/render")
    .then(({ createRenderSession, probeVideoOriginal, exportMotionVideo }) => ({
      createRenderSession,
      probeVideoOriginal,
      exportMotionVideo,
    }))
    .catch((error: unknown) => {
      apiPromise = undefined;
      throw error;
    }));
}
const initial: ToolState = {
  phase: "preparing",
  effect: null,
  name: "",
  width: 0,
  height: 0,
  edge: 1280,
  sourceDuration: 0,
  clipStart: 0,
  clipLength: 0,
  hasAudio: false,
  keepAudio: false,
  playing: false,
  time: 0,
  comparing: false,
  progress: 0,
  error: null,
};
export class ToolController {
  private state: ToolState = initial;
  private readonly listeners = new Set<() => void>();
  private readonly transportListeners = new Set<() => void>();
  private progressValue = 0;
  private seekStart: number | null = null;
  private readonly progressListeners = new Set<() => void>();
  readonly progress = {
    read: () => this.progressValue,
    subscribe: (fn: () => void) => {
      this.progressListeners.add(fn);
      return () => {
        this.progressListeners.delete(fn);
      };
    },
  };
  private setProgress(value: number) {
    this.progressValue = value;
    this.progressListeners.forEach((fn) => fn());
  }
  private readonly urls = new Map<string, ReturnType<typeof setTimeout>>();
  private transportState = { time: 0, playing: false, duration: 0 };
  readonly transport = {
    read: () => this.transportState,
    subscribe: (fn: () => void) => {
      this.transportListeners.add(fn);
      return () => {
        this.transportListeners.delete(fn);
      };
    },
  };
  private model: ToolDocument | null = null;
  private renderer: ToolRenderer | null = null;
  private monitor: PreviewAudio | null = null;
  get previewAudio() {
    return this.monitor ?? undefined;
  }
  private sourceAbort: AbortController | null = null;
  private exportAbort: AbortController | null = null;
  private queued: { file: File; tool: ToolDefinition; id: number } | null = null;
  private opening: Promise<void> | null = null;
  private exporting: Promise<void> | null = null;
  private closed = false;
  private disposal: Promise<void> | null = null;
  private generation = 0;
  private timing: ReturnType<typeof beginProjectTiming> = undefined;
  constructor(
    private readonly host: HTMLElement,
    private readonly activity: (file: File, active: boolean, phase?: "prepare" | "export") => void,
  ) {}
  read = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(patch: Partial<ToolState>) {
    if (this.closed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private publishModel(phase: ToolState["phase"] = "ready") {
    if (!this.model) return;
    const model = this.model,
      page = model.page();
    this.publish({
      phase,
      effect: model.effect(),
      name: model.source.file.name,
      width: page.width,
      height: page.height,
      edge: model.edge,
      sourceDuration: model.source.duration,
      clipStart: model.clipStart,
      clipLength: model.clipLength,
      hasAudio: model.source.hasAudio,
      keepAudio: model.keepAudio,
      error: null,
    });
  }
  open(file: File, tool: ToolDefinition) {
    if (this.closed) return;
    this.timing?.finish("cancelled");
    this.sourceAbort?.abort();
    this.exportAbort?.abort();
    this.queued = { file, tool, id: ++this.generation };
    this.activity(file, true, "prepare");
    this.publish({ ...initial, name: file.name });
    this.pump();
  }
  private pump() {
    if (this.opening || !this.queued || this.closed) return;
    this.opening = this.drain().finally(() => {
      this.opening = null;
      this.pump();
    });
  }
  private async drain() {
    while (this.queued && !this.closed) {
      const request = this.queued;
      this.queued = null;
      const abort = new AbortController();
      this.sourceAbort = abort;
      const active = () => !this.closed && request.id === this.generation && !abort.signal.aborted;
      try {
        await this.exporting;
        const retired = await Promise.allSettled([
          this.monitor?.dispose(),
          this.renderer?.dispose(),
        ]);
        this.monitor = null;
        this.renderer = null;
        const failed = retired.filter((result) => result.status === "rejected");
        if (failed.length)
          throw new AggregateError(
            failed.map((result) => result.reason),
            "Preview cleanup failed.",
          );
        this.model = null;
        if (!active()) continue;
        const timing = beginProjectTiming(`Tool ${request.tool.slug}`);
        this.timing = timing;
        timing?.stage("Load Melt renderer module");
        const api = await loadApi();
        if (!active()) continue;
        timing?.stage("Read + validate local media");
        const source = await prepareToolSource(request.file, request.tool, api, abort.signal);
        if (!active()) continue;
        timing?.stage("Prepare validated document");
        const model = new ToolDocument(source, request.tool);
        this.model = model;
        timing?.stage("First GPU frame");
        this.renderer = new ToolRenderer(model, api, this.host, abort.signal, {
          ready: () => {
            if (active()) {
              this.publishModel();
              this.activity(request.file, false);
              timing?.finish("ready");
            }
          },
          time: (time, playing) => {
            if (!active()) return;
            this.transportState = { time, playing, duration: model.clipLength };
            this.transportListeners.forEach((fn) => fn());
          },
          error: (error) => {
            if (active()) {
              this.publish({ phase: "error", error });
              this.activity(request.file, false);
              timing?.finish("failed", error);
            }
          },
        });
        if (source.hasAudio)
          this.monitor = new PreviewAudio({
            source: () => ({ project: model.project(), pageId: model.page().id }),
            read: () => ({
              playing: this.transportState.playing,
              time: {
                value: Math.round(
                  (this.renderer?.readTime() ?? this.transportState.time) * 1_000_000,
                ),
                rate: 1_000_000,
              },
            }),
            subscribe: this.transport.subscribe,
            holdPlayback: () => this.renderer!.holdPlayback(),
            pause: () => this.renderer?.play(false),
            resolver: () => {
              if (!source.resolver) throw new Error("Audio originals are unavailable.");
              return source.resolver;
            },
            onError: (error) => {
              if (active()) this.publish({ error });
            },
          });
      } catch (error) {
        if (active()) {
          this.publish({ phase: "error", error });
          this.activity(request.file, false);
          this.timing?.finish("failed", error);
        }
      }
    }
  }
  preview = (patch: Partial<Effect>) => {
    if (this.model && this.renderer && this.state.phase === "ready")
      this.renderer.preview(this.model.draft(patch));
  };
  cancelPreview = () => {
    this.renderer?.preview(null);
  };
  commit = (patch: Partial<Effect>) => {
    if (this.model && this.state.phase === "ready") {
      this.model.commit(patch);
      this.renderer?.update();
      this.publishModel();
    }
  };
  resize = (edge: number) => {
    if (this.model && this.state.phase === "ready") {
      this.model.resize(edge);
      this.renderer?.update();
      this.publishModel();
    }
  };
  clip = (start: number, length: number) => {
    if (this.model && this.state.phase === "ready") {
      this.model.clip(start, length);
      this.monitor?.refresh();
      this.renderer?.update();
      this.renderer?.seek(0);
      this.publishModel();
    }
  };
  audio = (keep: boolean) => {
    if (this.model && this.state.phase === "ready") {
      this.model.audio(keep);
      this.monitor?.refresh();
      this.renderer?.update();
      this.publishModel();
    }
  };
  play = (playing: boolean) => this.renderer?.play(playing);
  seek = (time: number) => this.renderer?.seek(time);
  beginSeek = () => {
    this.seekStart = this.transportState.time;
    this.renderer?.play(false);
  };
  commitSeek = (time: number) => {
    this.renderer?.seek(time);
    this.seekStart = null;
  };
  cancelSeek = () => {
    if (this.seekStart !== null) this.renderer?.seek(this.seekStart);
    this.seekStart = null;
  };
  compare = (original: boolean) => {
    this.renderer?.compare(original);
    this.publish({ comparing: original });
  };
  cancelExport = () => this.exportAbort?.abort();
  download(format: ImageOutput | VideoOutput) {
    if (this.exporting || !this.model || !this.renderer || this.state.phase !== "ready")
      return Promise.resolve();
    const model = this.model,
      renderer = this.renderer,
      generation = this.generation;
    const abort = new AbortController();
    this.exportAbort = abort;
    const wasPlaying = renderer.playing;
    renderer.preview(null);
    renderer.compare(false);
    renderer.play(false);
    renderer.freeze(true);
    this.setProgress(0);
    this.publish({ phase: "exporting", progress: 0, error: null, comparing: false });
    this.activity(model.source.file, true, "export");
    this.exporting = (async () => {
      let last = 0;
      try {
        let blob: Blob;
        if (model.tool.media === "image")
          blob = await renderer.image(format as ImageOutput, abort.signal);
        else {
          const api = await loadApi();
          const result = await api.exportMotionVideo(model.project(), {
            compositionId: model.page().id,
            container: format as VideoOutput,
            mediaResolver: model.source.resolver,
            maxGpuBytes: 192 * 1024 * 1024,
            maxOutputBytes: 128 * 1024 * 1024,
            maxFrames: 1800,
            signal: abort.signal,
            beforeFrame: async () => {
              abort.signal.throwIfAborted();
              const scheduler = (
                globalThis as typeof globalThis & { scheduler?: { yield?: () => Promise<void> } }
              ).scheduler;
              if (scheduler?.yield) await scheduler.yield();
              else await new Promise<void>((resolve) => setTimeout(resolve, 0));
            },
            onProgress: ({ fraction }) => {
              if (generation !== this.generation || this.closed) return;
              if (performance.now() - last > 150 || fraction === 1) {
                last = performance.now();
                this.setProgress(fraction);
              }
            },
          });
          if (!result.blob) throw new Error("Video encoding did not return a file.");
          blob = result.blob;
        }
        abort.signal.throwIfAborted();
        if (this.closed || generation !== this.generation) return;
        const extension =
          blob.type === "video/mp4"
            ? "mp4"
            : blob.type === "video/webm"
              ? "webm"
              : blob.type === "image/jpeg"
                ? "jpg"
                : blob.type.split("/")[1]!;
        const url = URL.createObjectURL(blob),
          link = document.createElement("a");
        link.href = url;
        link.download = `${model.source.file.name.replace(/\.[^.]+$/, "")}-${model.tool.style}.${extension}`;
        document.body.append(link);
        link.click();
        link.remove();
        // A browser task admits the download before this temporary URL is released.
        const timer = setTimeout(() => {
          URL.revokeObjectURL(url);
          this.urls.delete(url);
        }, 0);
        this.urls.set(url, timer);
      } catch (error) {
        if (!abort.signal.aborted && !this.closed && generation === this.generation)
          this.publish({ error });
      } finally {
        if (!this.closed && generation === this.generation) {
          renderer.freeze(false);
          renderer.play(wasPlaying);
          this.publish({ phase: "ready", progress: 0 });
          this.activity(model.source.file, false);
        }
        this.exporting = null;
        this.exportAbort = null;
      }
    })();
    return this.exporting;
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.closed = true;
    this.generation++;
    this.queued = null;
    this.sourceAbort?.abort();
    this.exportAbort?.abort();
    this.timing?.finish("cancelled");
    this.listeners.clear();
    this.transportListeners.clear();
    this.progressListeners.clear();
    for (const [url, timer] of this.urls) {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    }
    this.urls.clear();
    this.disposal = (async () => {
      await this.exporting;
      await this.opening;
      const retired = await Promise.allSettled([this.monitor?.dispose(), this.renderer?.dispose()]);
      this.monitor = null;
      this.model = null;
      this.renderer = null;
      const failed = retired.filter((result) => result.status === "rejected");
      if (failed.length)
        throw new AggregateError(
          failed.map((result) => result.reason),
          "Preview cleanup failed.",
        );
    })();
    return this.disposal;
  }
}
