import {
  getEffectDefinition,
  motionTimeToSeconds,
  motionFrameComposition,
  resampleMotionFrame,
  createLayerGeometryIndex,
  type Asset,
  type Bounds,
  type Composition,
} from "@musart/core";
import { LinearFilter, NoColorSpace, RenderTarget, type WebGPURenderer } from "three/webgpu";
import type { GpuResourceCache, GpuResource } from "../../cache/GpuResourceCache";
import type { GpuCompositor } from "../../compositing/GpuCompositor";
import type { RenderOptions } from "../../compositing/types";
import type { TemporalEffectInputs } from "../GpuEffects";
import { captureComposition } from "./source";
import { hasEffectTreatment } from "../shared/active";
import { ScanCapturePass } from "./capture";
import { scanPlan, scanSampleTime, stripRectangle } from "./plan";

class ScanHistory implements GpuResource {
  target: RenderTarget | null = null;
  bounds: Bounds | null = null;
  content: Bounds | null = null;
  recorded = 0;
  source?: WeakRef<Composition>;
  assets?: WeakRef<Record<string, Asset>>;
  configuration = "";
  get bytes() {
    return this.target ? this.target.width * this.target.height * 4 : 0;
  }
  get targets() {
    return this.target ? 1 : 0;
  }
  reset() {
    this.target?.dispose();
    this.target = null;
    this.recorded = 0;
    this.bounds = this.content = null;
  }
  dispose() {
    this.reset();
  }
}
function union(a: Bounds, b: Bounds): Bounds {
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}
async function yieldInput(signal?: AbortSignal) {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, 0);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** Source-local strip history. Cold seeks replay a fixed sample grid, not playback history. */
export class TemporalSources {
  private sampler: GpuCompositor | null = null;
  private capture: ScanCapturePass | null = null;
  private samplePasses = 0;
  private captures = 0;
  private hits = 0;
  private closed = false;
  private owner?: WeakRef<Composition>;
  private readonly samplerBytes: number;
  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly cache: GpuResourceCache,
  ) {
    this.samplerBytes = Math.min(64 * 1024 * 1024, Math.floor(cache.maxBytes / 4));
  }
  private async source() {
    if (this.sampler) return this.sampler;
    this.cache.reserveExternal("temporal-source-cache", this.samplerBytes);
    try {
      const { GpuCompositor } = await import("../../compositing/GpuCompositor");
      if (this.closed) throw new DOMException("Temporal source disposed.", "AbortError");
      return (this.sampler = new GpuCompositor(this.renderer, { maxBytes: this.samplerBytes }));
    } catch (error) {
      this.cache.reserveExternal("temporal-source-cache", 0);
      throw error;
    }
  }
  private async releaseSource() {
    this.capture?.releaseInput();
    if (this.sampler) {
      const sampler = this.sampler;
      this.sampler = null;
      await sampler.dispose();
    }
    this.cache.reserveExternal("temporal-source-cache", 0);
  }
  async prepare(
    page: Composition,
    assets: Record<string, Asset>,
    options: RenderOptions,
  ): Promise<TemporalEffectInputs> {
    const result = new Map<string, import("../GpuEffects").TemporalEffectInput>();
    if (
      !page.layers.some((layer) =>
        layer.effects.some(
          (effect) => hasEffectTreatment(effect) && getEffectDefinition(effect.type).temporal,
        ),
      )
    ) {
      await this.releaseSource();
      return result;
    }
    const base = options.motionFrame ? motionFrameComposition(options.motionFrame) : undefined;
    if (this.owner?.deref() !== base) {
      await this.releaseSource();
      this.owner = base ? new WeakRef(base) : undefined;
    }
    const geometry = createLayerGeometryIndex(page);
    const selected = options.sourceLayerId;
    const candidates = page.layers.filter(
      (layer) =>
        geometry.isVisible(layer.id) &&
        (!selected ||
          layer.id === selected ||
          geometry.ancestors(layer.id).some((parent) => parent.id === selected)),
    );
    let temporal = false;
    for (const layer of candidates)
      for (const effect of layer.effects) {
        if (!hasEffectTreatment(effect) || !getEffectDefinition(effect.type).temporal) continue;
        temporal = true;
        const authored = base?.layers.find((item) => item.id === layer.id);
        const originalEffect = authored?.effects.find((item) => item.id === effect.id);
        // A catalogue preview is not yet in the frozen source program's clock inventory.
        const clocked =
          !originalEffect && options.motionFrame?.mode === "motion"
            ? {
                ...effect,
                time: (effect.time ?? 0) + motionTimeToSeconds(options.motionFrame.time),
              }
            : effect;
        const plan = scanPlan(clocked, options.motionFrame?.mode === "motion");
        result.set(effect.id, { phase: plan.phase });
        if (!options.motionFrame || options.motionFrame.mode !== "motion" || plan.phase <= 0)
          continue;
        if ((options.temporalDepth ?? 0) >= 3)
          throw new RangeError("Temporal source nesting exceeds the rendering budget.");
        if (!authored) continue;
        const offset = originalEffect ? (originalEffect.time ?? 0) : (effect.time ?? 0);
        const key = `temporal:${page.id.length}:${page.id}:${effect.id}`;
        let history = this.cache.get<ScanHistory>(key);
        if (!history) {
          history = new ScanHistory();
          this.cache.set(key, history);
        }
        const prefix = layer.effects.slice(
          0,
          layer.effects.findIndex((item) => item.id === effect.id),
        );
        const configuration = JSON.stringify([
          plan.settingsKey,
          offset,
          prefix.map((item) => item.id),
        ]);
        if (
          history.source?.deref() !== base ||
          history.assets?.deref() !== assets ||
          history.configuration !== configuration
        ) {
          history.reset();
          history.source = new WeakRef(base!);
          history.assets = new WeakRef(assets);
          history.configuration = configuration;
          this.cache.synchronize(key);
        }
        const previousRecorded = history.recorded;
        const wanted = Math.min(plan.samples, Math.ceil(plan.phase * plan.samples - 1e-9));
        const budget = options.temporalBudget ?? { remaining: 256 };
        for (let index = history.recorded; index < wanted; index++) {
          if (this.closed || options.signal?.aborted || (options.canRender && !options.canRender()))
            throw new DOMException("Rendering deferred.", "AbortError");
          if (--budget.remaining < 0)
            throw new RangeError(
              "Temporal sampling budget exceeded. Reduce scan detail or the number of temporal effects.",
            );
          const sampled = resampleMotionFrame(
            options.motionFrame,
            scanSampleTime(plan, index, offset),
          );
          const owner = sampled.page.layers.find((item) => item.id === layer.id)!;
          const capturePage = captureComposition(sampled.page, layer.id, effect.id, prefix);
          const sampler = await this.source(),
            before = sampler.stats().passes;
          const source = await sampler.render(capturePage, assets, {
            ...options,
            immutableFrame: undefined,
            sourceLayerId: layer.id,
            temporalDepth: (options.temporalDepth ?? 0) + 1,
            temporalBudget: budget,
            motionFrame: sampled.plan,
            scale: 1,
            mediaMode: "exact",
            mediaSequential: true,
            backgroundGpu: undefined,
            videoProxy: undefined,
            profileVideo: false,
          });
          this.samplePasses += sampler.stats().passes - before;
          const sourceBounds = source.bounds ?? {
            x: 0,
            y: 0,
            width: owner.width,
            height: owner.height,
          };
          if (!history.target) {
            history.content = { x: 0, y: 0, width: authored.width, height: authored.height };
            history.bounds = union(history.content, sourceBounds);
            const width = Math.ceil(history.bounds.width),
              height = Math.ceil(history.bounds.height);
            this.cache.ensureCapacity(key, width * height * 4);
            history.target = new RenderTarget(width, height, {
              depthBuffer: false,
              stencilBuffer: false,
              minFilter: LinearFilter,
              magFilter: LinearFilter,
            });
            history.target.texture.colorSpace = NoColorSpace;
            this.cache.synchronize(key);
          }
          this.capture ??= new ScanCapturePass(this.renderer, effect);
          const bounds = history.bounds!,
            content = history.content!;
          const local = {
            x: content.x - bounds.x,
            y: content.y - bounds.y,
            width: content.width,
            height: content.height,
          };
          await this.capture.draw(
            source,
            sourceBounds,
            bounds,
            local,
            effect,
            stripRectangle(
              history.target.width,
              history.target.height,
              {
                x: (local.x * history.target.width) / bounds.width,
                y: (local.y * history.target.height) / bounds.height,
                width: (local.width * history.target.width) / bounds.width,
                height: (local.height * history.target.height) / bounds.height,
              },
              plan.direction,
              index,
              plan.samples,
            ),
            history.target,
            () =>
              !this.closed &&
              !options.signal?.aborted &&
              (!options.canRender || options.canRender()),
          );
          history.recorded = index + 1;
          this.captures++;
          if (index % 4 === 3) await yieldInput(options.signal);
        }
        if (history.target)
          result.set(effect.id, {
            phase: plan.phase,
            texture: history.target.texture,
            bounds: history.bounds!,
            content: history.content!,
          });
        if (wanted <= previousRecorded) this.hits++;
      }
    if (!temporal || !options.motionFrame) await this.releaseSource();
    return result;
  }
  stats() {
    return {
      captures: this.captures,
      cacheHits: this.hits,
      passes: this.samplePasses + (this.capture?.passes ?? 0),
    };
  }
  async dispose() {
    this.closed = true;
    await this.releaseSource();
    this.capture?.dispose();
    this.capture = null;
  }
}
