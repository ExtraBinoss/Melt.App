import { GpuPassProfile } from "./gpu-pass-profile";
import type { GpuStats } from "@musart/render";
import type { WebGPURenderer } from "three/webgpu";

export interface SceneFrameSample {
  compositionId: string;
  revision: number;
  at: number;
  hostMs: number | null;
  hostStarted: number | null;
  gpuMs: number | null;
  gpuPasses: Readonly<Record<string, number>> | null;
  drawCommands: number;
  stats: GpuStats | null;
  passes: number;
  phases: Record<"pipeline" | "sources" | "text" | "compose", number | null>;
}

/** Dormant outside an explicit diagnostic. Only Three's timestamp queries read timing buffers. */
export class SceneProfileSource {
  private token: symbol | null = null;
  private sink: ((sample: SceneFrameSample) => void) | null = null;
  private restore: (() => void) | null = null;
  private pendingGpu = false;
  private readonly gpuPasses: GpuPassProfile;
  private gpuSupported = false;
  private frame: {
    revision: number;
    started: number;
    hostMs: number | null;
    passes: number;
    frames: number;
  } | null = null;
  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly stats: () => GpuStats | null,
  ) {
    this.gpuPasses = new GpuPassProfile(renderer);
  }
  get active() {
    return this.token !== null;
  }
  open(sink: (sample: SceneFrameSample) => void) {
    this.restore?.();
    const token = Symbol();
    this.token = token;
    this.sink = sink;
    if (this.renderer.domElement) this.renderer.domElement.dataset.compositionProfiling = "true";
    // Three exposes this flag at runtime; its base Backend declaration omits it.
    const backend = this.renderer.backend;
    const timestamps =
      "trackTimestamp" in backend && typeof backend.trackTimestamp === "boolean"
        ? (backend as typeof backend & {
            trackTimestamp: boolean;
            get?: (target: object) => unknown;
          })
        : null;
    const previousTrack = timestamps?.trackTimestamp;
    const previousReset = this.renderer.info.autoReset;
    this.gpuSupported =
      timestamps !== null &&
      typeof timestamps.get === "function" &&
      this.renderer.hasFeature("timestamp-query") &&
      this.gpuPasses.supported;
    if (this.gpuSupported) this.gpuPasses.open();
    if (timestamps && this.gpuSupported) timestamps.trackTimestamp = true;
    this.renderer.info.autoReset = false;
    const close = () => {
      if (this.token !== token) return;
      this.token = null;
      this.sink = null;
      if (this.renderer.domElement) this.renderer.domElement.dataset.compositionProfiling = "false";
      this.frame = null;
      this.gpuPasses.close();
      if (timestamps && previousTrack !== undefined) timestamps.trackTimestamp = previousTrack;
      if (timestamps && previousTrack === false && typeof timestamps.get === "function") {
        // Three caches the canvas descriptor; retire our borrowed timestamp writes too.
        const data = timestamps.get(this.renderer.getCanvasTarget()) as {
          descriptor?: { timestampWrites?: unknown };
        };
        if (data.descriptor) data.descriptor.timestampWrites = undefined;
      }
      this.renderer.info.autoReset = previousReset;
      this.renderer.info.reset();
      this.restore = null;
    };
    this.restore = close;
    return close;
  }
  begin(revision: number) {
    if (!this.active) return;
    this.renderer.info.reset();
    this.gpuPasses.begin();
    const stats = this.stats();
    this.frame = {
      revision,
      started: performance.now(),
      hostMs: null,
      passes: stats?.passes ?? 0,
      frames: stats?.frames ?? 0,
    };
  }
  prepared(revision: number) {
    if (this.frame?.revision === revision)
      this.frame.hostMs = performance.now() - this.frame.started;
  }
  presented(compositionId: string, revision: number) {
    if (!this.active || !this.sink || this.frame?.revision !== revision) return;
    const token = this.token,
      sink = this.sink;
    const stats = this.stats();
    const composed = (stats?.frames ?? 0) > this.frame.frames;
    const phase = (id: "pipeline" | "sources" | "text" | "compose") =>
      composed ? (stats?.profile?.[id].at(-1) ?? null) : 0;
    const sample: SceneFrameSample = {
      compositionId,
      revision,
      at: performance.now(),
      hostMs: this.frame.hostMs,
      hostStarted: this.frame.hostMs === null ? null : this.frame.started,
      gpuMs: null,
      gpuPasses: null,
      drawCommands: this.renderer.info.render.drawCalls,
      stats,
      passes: Math.max(0, (stats?.passes ?? 0) - this.frame.passes),
      phases: {
        pipeline: phase("pipeline"),
        sources: phase("sources"),
        text: phase("text"),
        compose: phase("compose"),
      },
    };
    const batch = this.gpuPasses.take();
    this.frame = null;
    if (!this.gpuSupported || this.pendingGpu) {
      sink(sample);
      return;
    }
    this.pendingGpu = true;
    // Timestamps are metadata, never texture/pixel readbacks. There is at most one pending map.
    void this.renderer
      .resolveTimestampsAsync("render")
      .then(() => {
        sample.gpuPasses = this.gpuPasses.resolve(batch);
        if (sample.gpuPasses)
          sample.gpuMs = Object.values(sample.gpuPasses).reduce((a, b) => a + b, 0);
      })
      .catch(() => {})
      .finally(() => {
        this.pendingGpu = false;
        if (this.token === token) sink(sample);
      });
  }
  dispose() {
    this.restore?.();
  }
}
