import {
  applyMotionFrame,
  evaluateMotion,
  motionProgramForFrame,
  type Asset,
  type Composition,
} from "@musart/core";
import { HalfFloatType, LinearFilter, RenderTarget, type WebGPURenderer } from "three/webgpu";
import type { GpuCompositor } from "../../compositing/GpuCompositor";
import type { FrameTexture, RenderOptions } from "../../compositing/types";
import type { EffectHistoryInput } from "../shared/context";
import { GpuPasses } from "../../compositing/passes";
import { gpuTextureLimit } from "../../cache/texture-limits";
import {
  trailCaptureRaster,
  trailCaptureRequests,
  trailHistoricalBounds,
  trailUpstreamPage,
} from "./capture-plan";

/** Bounded, explicitly admitted snapshots of authored poses. No framebuffer history or readbacks. */
export class TemporalEffectSources {
  private compositor: GpuCompositor | null = null;
  private passes: GpuPasses | null = null;
  private snapshots: RenderTarget[] = [];
  private closed = false;
  readonly childBudget: number;
  readonly snapshotBudget: number;
  constructor(
    private readonly renderer: WebGPURenderer,
    budget: number,
    private readonly createCompositor: (maxBytes: number) => GpuCompositor,
    private readonly reserve: (bytes: number) => void,
  ) {
    this.childBudget = Math.min(64 * 1024 * 1024, Math.floor(budget / 4));
    this.snapshotBudget = this.childBudget;
  }

  async prepare(
    page: Composition,
    assets: Record<string, Asset>,
    options: RenderOptions,
  ): Promise<ReadonlyMap<string, readonly EffectHistoryInput[]>> {
    const result = new Map<string, readonly EffectHistoryInput[]>();
    const plan = options.motionFrame;
    const program = plan && motionProgramForFrame(plan);
    // Static poses have no authored past; discard retained snapshots from an earlier sample.
    if (options.history === "disabled" || !plan || !program || program.mode !== "motion") {
      this.releaseSnapshots();
      return result;
    }
    const requests = trailCaptureRequests(page, plan.time);
    const count = requests.reduce((n, request) => n + request.samples.length, 0);
    if (!count) {
      this.releaseSnapshots();
      return result;
    }
    const captureBounds = options.viewport ?? {
      x: 0,
      y: 0,
      width: page.width,
      height: page.height,
    };
    const { width, height, scale } = trailCaptureRaster(
      captureBounds,
      options.scale ?? 1,
      count,
      gpuTextureLimit(this.renderer),
      this.snapshotBudget,
    );
    const previousBytes = this.snapshots.reduce(
      (bytes, target) => bytes + target.width * target.height * 8,
      0,
    );
    const reusableBytes = this.snapshots
      .slice(0, count)
      .reduce(
        (bytes, target) =>
          bytes + (target.width === width && target.height === height ? width * height * 8 : 0),
        0,
      );
    this.reserve(this.childBudget + previousBytes + width * height * 8 * count - reusableBytes);
    this.compositor ??= this.createCompositor(this.childBudget);
    this.passes ??= new GpuPasses(this.renderer);
    while (this.snapshots.length > count) this.snapshots.pop()!.dispose();
    let index = 0;
    for (const request of requests) {
      const inputs: EffectHistoryInput[] = [];
      for (const sample of request.samples) {
        this.assertActive(options);
        const previous = evaluateMotion(program, sample.time);
        const authored = applyMotionFrame(program, previous);
        const upstream: Composition = trailUpstreamPage(authored, request);
        const ownerBounds = request.ownerId
          ? trailHistoricalBounds(upstream, request.ownerId, captureBounds)
          : undefined;
        const frame: FrameTexture = await this.compositor.render(upstream, assets, {
          ...options,
          immutableFrame: undefined,
          history: "disabled",
          effectCapture: true,
          effectCaptureOwnerId: request.ownerId,
          scale,
          effectSourceScale: Math.min(options.effectSourceScale ?? 1, scale),
          imageSourceScale: Math.min(options.imageSourceScale ?? scale, scale),
          framing: undefined,
          motionFrame: previous,
          canRender: () =>
            !this.closed && !options.signal?.aborted && (options.canRender?.() ?? true),
        });
        this.assertActive(options);
        let target = this.snapshots[index];
        if (!target) {
          target = new RenderTarget(width, height, {
            depthBuffer: false,
            stencilBuffer: false,
            type: HalfFloatType,
            minFilter: LinearFilter,
            magFilter: LinearFilter,
          });
          this.snapshots[index] = target;
        } else target.setSize(width, height);
        this.passes.copyTo(frame, target, frame.premultiplied);
        inputs[sample.slot] = {
          texture: target.texture,
          available: true,
          flipY: true,
          captureBounds,
          ...(ownerBounds ? { ownerBounds } : {}),
        };
        index++;
      }
      result.set(request.effect.id, inputs);
    }
    this.reserve(this.childBudget + width * height * 8 * count);
    return result;
  }
  stats() {
    const child = this.compositor?.stats();
    return {
      targets: this.snapshots.length + (child?.targets ?? 0),
      passes: (this.passes?.passes ?? 0) + (child?.passes ?? 0),
      effectPasses: child?.effectPasses ?? 0,
      uploads: child?.uploads ?? 0,
    };
  }
  private assertActive(options: RenderOptions) {
    options.signal?.throwIfAborted();
    if (this.closed || (options.canRender && !options.canRender()))
      throw new DOMException("Temporal rendering superseded", "AbortError");
  }
  private releaseSnapshots() {
    for (const snapshot of this.snapshots) snapshot.dispose();
    this.snapshots = [];
    this.reserve(this.compositor ? this.childBudget : 0);
  }
  async dispose() {
    this.closed = true;
    try {
      await this.compositor?.dispose();
    } finally {
      this.compositor = null;
      this.releaseSnapshots();
      this.passes?.dispose();
      this.passes = null;
      this.reserve(0);
    }
  }
}
