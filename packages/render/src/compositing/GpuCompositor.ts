import { completeGpuFrame } from "./publication";
import { drawLayerSource } from "./layer-source";
import type { SpatialSources } from "../spatial/SpatialSources";
import {
  createLayerGeometryIndex,
  isPublishedComposition,
  isPublishedAssets,
  type Asset,
  type Bounds,
  type Composition,
  type Layer,
  type MotionFramePlan,
} from "@musart/core";
import type { RenderTarget, WebGPURenderer } from "three/webgpu";
import { ColorPipeline } from "../color/ColorPipeline";
import { PrintProofPass } from "../color/proof/PrintProofPass";
import { GpuResourceCache } from "../cache/GpuResourceCache";
import { gpuTextureLimit } from "../cache/texture-limits";
import { createSourceKeys } from "../cache/keys";
import { sameCompositionInput } from "../cache/composition-input";
import { finishLayerSource } from "./finish-layer";
import { EffectResources } from "./effect-resources";
import { VectorSources } from "../surface/vector/source";
import { TextureSources } from "../surface/TextureSources";
import { TextSources } from "../surface/text/source";
import type { FontResolver } from "../surface/text/fonts";
import { PrimitiveBatch } from "./primitives/batch";
import { isInstancedPrimitive, primitivePaintKey } from "./primitives/eligibility";
import { NormalBatch } from "./normal-batch";
import { GpuPasses } from "./passes";
import { LayerTargets } from "./targets";
import { groupViewport, type GroupViewport } from "./group-viewport";
import {
  assertRenderSize,
  rasterExtent,
  type FrameTexture,
  type GpuStats,
  type RenderOptions,
} from "./types";

interface RenderFrame {
  readonly page: Composition;
  readonly scale: number;
  readonly vectorAntialias: boolean;
  readonly keyFor: (layer: Layer) => string;
  readonly referenceKeyFor: (layer: Layer) => string;
  readonly geometry: ReturnType<typeof createLayerGeometryIndex>;
}

/** Retained GPU graph. Only font/image preparation awaits; all GPU submissions are synchronous. */
export class GpuCompositor {
  private readonly maxTextureDimension: number;
  private readonly cache: GpuResourceCache;
  private readonly sources: TextureSources;
  private readonly fontResolver?: FontResolver;
  private readonly texts: TextSources;
  private effects: EffectResources | null = null;
  private passes: GpuPasses | null = null;
  private normal: NormalBatch | null = null;
  private primitives: PrimitiveBatch | null = null;
  private vectors: VectorSources | null = null;
  private spatial: SpatialSources | null = null;
  private color: ColorPipeline | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private disposal: Promise<void> | null = null;
  private frames = 0;
  private cacheHits = 0;
  private proofPasses = 0;
  private profile: Record<"pipeline" | "sources" | "text" | "compose", number[]> | null = null;
  private sample(
    phase: "pipeline" | "sources" | "text" | "compose",
    started: number,
    enabled?: boolean,
  ) {
    if (!enabled) return;
    this.profile ??= { pipeline: [], sources: [], text: [], compose: [] };
    const samples = this.profile[phase];
    samples.push(performance.now() - started);
    if (samples.length > 256) samples.shift();
  }
  private retainedRoot = "";
  private currentSpatial: GpuStats["spatial"] = null;
  private readonly retainedInputs = new WeakMap<
    LayerTargets,
    {
      page: WeakRef<Composition>;
      assets: WeakRef<Record<string, Asset>>;
      motionFrame?: MotionFramePlan;
      spatial: GpuStats["spatial"];
    }
  >();

  constructor(
    private readonly renderer: WebGPURenderer,
    options: { maxBytes?: number; fontResolver?: FontResolver } = {},
  ) {
    this.fontResolver = options.fontResolver;
    this.maxTextureDimension = gpuTextureLimit(renderer);
    this.cache = new GpuResourceCache(options.maxBytes);
    this.sources = new TextureSources(this.cache, this.maxTextureDimension, renderer);
    this.texts = new TextSources(renderer, this.cache, { fontResolver: options.fontResolver });
  }

  /** Exact immutable-input hit inside the existing GPU LRU; no allocation, upload or readback. */
  retainedFrame(
    page: Composition,
    assets: Record<string, Asset>,
    scale: number,
    motionFrame?: MotionFramePlan,
    colorOutput: RenderOptions["colorOutput"] = "display",
    vectorAntialias = false,
  ): FrameTexture | null {
    if (this.disposed || !isPublishedComposition(page) || !isPublishedAssets(assets)) return null;
    const key = `page:${page.id}:${scale}${colorOutput === "source" ? ":source" : ""}${vectorAntialias ? ":vector-aa" : ""}`,
      entry = this.cache.get<LayerTargets>(key);
    const input = entry && this.retainedInputs.get(entry);
    if (
      !entry?.signature ||
      !entry.output ||
      !input ||
      !sameCompositionInput(input.page.deref(), page) ||
      input.assets.deref() !== assets ||
      (input.motionFrame !== motionFrame &&
        Boolean(input.motionFrame?.mediaRequests.length || motionFrame?.mediaRequests.length)) ||
      (page.layers.some((layer) => layer.kind === "video") && !motionFrame)
    )
      return null;
    this.retainedRoot = key;
    this.currentSpatial = input.spatial;
    input.page = new WeakRef(page);
    this.cacheHits++;
    return entry.output;
  }

  /** A hidden display no longer pins its previous artboard against the bounded LRU. */
  releasePresentation(): void {
    this.retainedRoot = "";
  }

  render(
    page: Composition,
    assets: Record<string, Asset>,
    options: RenderOptions = {},
  ): Promise<FrameTexture> {
    if (this.disposed) return Promise.reject(new Error("Le compositeur GPU est fermé."));
    const job = this.queue.then(async () => {
      const scale = options.scale ?? 1;
      assertRenderSize(page, scale);
      this.cache.beginFrame(this.retainedRoot);
      this.cache.get("shared-effects");
      this.cache.get("shared-primitives");
      if (options.canRender && !options.canRender())
        throw new DOMException("Rendering deferred.", "AbortError");
      this.passes ??= new GpuPasses(this.renderer);
      this.normal ??= new NormalBatch(this.renderer);
      this.vectors ??= new VectorSources(this.renderer, this.cache);
      this.color ??= new ColorPipeline(this.renderer);
      if (!this.effects) {
        this.effects = new EffectResources(this.renderer);
        this.cache.set("shared-effects", this.effects);
      }
      if (!this.primitives) {
        this.primitives = new PrimitiveBatch(this.renderer);
        this.cache.set("shared-primitives", this.primitives);
      }
      const geometry = createLayerGeometryIndex(page);
      this.normal.retain(geometry.byId);
      const preparationKey = "pipeline-preparation";
      const preparationTarget = this.target(
        this.entry(preparationKey),
        preparationKey,
        "pipeline",
        1,
        1,
      );
      const canPrepare = () => {
        if (this.disposed) throw new Error("Le compositeur GPU est fermé.");
        return !options.signal?.aborted && (!options.canRender || options.canRender());
      };
      const pipelineStarted = options.profileVideo ? performance.now() : 0;
      let proof: PrintProofPass | undefined;
      if (page.colorSpace === "cmyk" && options.colorOutput !== "source") {
        proof = this.cache.get<PrintProofPass>("print-proof");
        if (!proof) {
          proof = new PrintProofPass(this.renderer);
          this.cache.set("print-proof", proof);
        }
        await proof.prepare(preparationTarget, canPrepare);
      }
      await this.passes.prepare(preparationTarget, canPrepare);
      for (const layer of page.layers) {
        if (!layer.effects.length) continue;
        // Future opacity/enabled keys reuse these materials; only actual drawing applies pixels.
        const preparedEffects = layer.effects.map((effect) =>
          effect.enabled ? effect : { ...effect, enabled: true },
        );
        this.cache.ensureCapacity(
          "shared-effects",
          this.effects.projectedBytes(1, 1, preparedEffects),
        );
        try {
          await this.effects.prepare(
            layer.effects,
            preparationTarget,
            layer.width,
            layer.height,
            canPrepare,
          );
        } finally {
          this.cache.synchronize("shared-effects");
        }
      }
      await this.normal.prepare(page.layers, preparationTarget, canPrepare);
      this.sample("pipeline", pipelineStarted, options.profileVideo);
      const sourceStarted = options.profileVideo ? performance.now() : 0;
      await this.sources.prepare(page, assets, options);
      this.sample("sources", sourceStarted, options.profileVideo);
      const textStarted = options.profileVideo ? performance.now() : 0;
      await this.texts.prepare(page, { target: preparationTarget, canContinue: canPrepare });
      this.sample("text", textStarted, options.profileVideo);
      if (this.spatial || page.layers.some((layer) => layer.spatial?.enabled)) {
        this.spatial ??= new (await import("../spatial/SpatialSources")).SpatialSources(
          this.renderer,
          this.cache,
          { fontResolver: options.fontResolver ?? this.fontResolver },
        );
        const started = options.profileVideo ? performance.now() : 0;
        await this.spatial.prepare(page, assets, scale, preparationTarget, canPrepare);
        if (options.profileVideo && this.profile)
          this.profile.sources[this.profile.sources.length - 1]! += performance.now() - started;
      }
      const composeStarted = options.profileVideo ? performance.now() : 0;
      if (options.canRender && !options.canRender())
        throw new DOMException("Rendering deferred.", "AbortError");
      if (this.disposed) throw new Error("Le compositeur GPU est fermé.");
      // Compose synchronously and restore renderer state before yielding for publication.
      const frame: RenderFrame = {
        page,
        scale,
        vectorAntialias: !!options.vectorAntialias,
        keyFor: createSourceKeys(page, assets, scale, {
          geometry,
          videoStamp: (id) => this.sources.videoStamp(id),
        }),
        referenceKeyFor: createSourceKeys(page, assets, 1, {
          geometry,
          videoStamp: (id) => this.sources.videoStamp(id),
        }),
        geometry,
      };
      const { keyFor } = frame;
      const rootKey = `page:${page.id}:${scale}${options.colorOutput === "source" ? ":source" : ""}${frame.vectorAntialias ? ":vector-aa" : ""}`;
      const entry = this.entry(rootKey);
      const roots = geometry.children(null);
      const signature = JSON.stringify([
        page.width,
        page.height,
        page.background,
        page.colorSpace ?? "srgb",
        roots.map((layer) => [
          layer.id,
          layer.x,
          layer.y,
          layer.rotation,
          layer.scaleX ?? 1,
          layer.scaleY ?? 1,
          layer.opacity,
          layer.visible,
          layer.blendMode,
          isInstancedPrimitive(layer) ? primitivePaintKey(layer) : keyFor(layer),
        ]),
      ]);
      if (entry.signature === signature && entry.output) {
        this.cacheHits++;
        this.frames++;
        this.retainedRoot = rootKey;
        this.rememberInput(entry, page, assets, options.motionFrame);
        this.sample("compose", composeStarted, options.profileVideo);
        return entry.output;
      }
      entry.signature = "";
      const composed = this.children(
        null,
        page.width,
        page.height,
        page.background,
        entry,
        rootKey,
        frame,
      );
      const target = this.target(
        entry,
        rootKey,
        entry.nextPresentationRole(),
        composed.width,
        composed.height,
      );
      if (proof) {
        proof.render(composed, target);
        this.proofPasses++;
      } else if (page.colorSpace === "display-p3") this.color.render(composed, target, "to-srgb");
      else if (page.colorSpace === "cmyk-proof") this.color.render(composed, target, "cmyk-proof");
      else this.passes.copyTo(composed, target);
      entry.output = await completeGpuFrame(this.renderer, target, options);
      entry.signature = signature;
      this.retainedRoot = rootKey;
      this.rememberInput(entry, page, assets, options.motionFrame);
      this.frames++;
      this.sample("compose", composeStarted, options.profileVideo);
      return entry.output;
    });
    this.queue = job.catch(() => undefined);
    return job;
  }

  private rememberInput(
    entry: LayerTargets,
    page: Composition,
    assets: Record<string, Asset>,
    motionFrame?: MotionFramePlan,
  ): void {
    this.currentSpatial = this.spatial?.stats() ?? null;
    if (isPublishedComposition(page) && isPublishedAssets(assets))
      this.retainedInputs.set(entry, {
        page: new WeakRef(page),
        assets: new WeakRef(assets),
        motionFrame,
        spatial: this.currentSpatial,
      });
    else this.retainedInputs.delete(entry);
  }

  private entry(key: string): LayerTargets {
    let entry = this.cache.get<LayerTargets>(key);
    if (!entry) {
      entry = new LayerTargets(this.maxTextureDimension);
      this.cache.set(key, entry);
    }
    return entry;
  }
  private target(
    entry: LayerTargets,
    key: string,
    role: string,
    width: number,
    height: number,
    mipmapped = false,
    samples = 0,
  ): RenderTarget {
    this.cache.ensureCapacity(key, entry.projectedBytes(role, width, height, mipmapped, samples));
    const target = entry.target(role, width, height, mipmapped, samples);
    this.cache.synchronize(key);
    return target;
  }
  private layer(layer: Layer, frame: RenderFrame, parentViewport?: Bounds): FrameTexture {
    const reference = layer.effects.some((effect) => effect.enabled) || !!layer.mask?.enabled;
    // Effects and masks consume the same authored reference pixels in every
    // caller. Output density changes sampling of this plane, never its content.
    if (reference && (frame.scale !== 1 || frame.vectorAntialias))
      frame = { ...frame, scale: 1, vectorAntialias: false, keyFor: frame.referenceKeyFor };
    const { page, scale, keyFor, geometry, vectorAntialias } = frame;
    const viewport =
      layer.kind === "group" && !reference
        ? groupViewport(layer, scale, parentViewport, this.maxTextureDimension)
        : null;
    const key = `layer:${page.id}:${layer.id}:${scale}${viewport ? ":window" : ""}${vectorAntialias ? ":vector-aa" : ""}`;
    const entry = this.entry(key);
    const signature = viewport ? JSON.stringify([keyFor(layer), viewport.key]) : keyFor(layer);
    if (entry.signature === signature && entry.output) {
      this.cacheHits++;
      return entry.output;
    }
    entry.signature = "";
    const width = rasterExtent(layer.width, scale);
    const height = rasterExtent(layer.height, scale);
    let source = drawLayerSource(layer, {
      width,
      height,
      scale,
      vectorAntialias,
      displayP3: page.colorSpace === "display-p3",
      entry,
      sources: this.sources,
      texts: this.texts,
      vectors: this.vectors!,
      spatial: this.spatial,
      passes: this.passes!,
      target: (role, samples = 0) => this.target(entry, key, role, width, height, false, samples),
      children: () =>
        this.children(
          layer.id,
          layer.width,
          layer.height,
          "transparent",
          entry,
          key,
          frame,
          viewport,
        ),
    });
    if (
      page.colorSpace === "display-p3" &&
      (layer.kind === "image" || layer.kind === "video" || layer.spatial?.enabled)
    ) {
      const converted = this.target(entry, key, "working-color", width, height);
      this.color!.render(source, converted, "to-p3");
      source = { ...source, texture: converted.texture };
    }
    if (reference)
      source = finishLayerSource(layer, page, scale, source, {
        target: (role, w, h, mipmapped) => this.target(entry, key, role, w, h, mipmapped),
        passes: this.passes!,
        effects: this.effects!,
        cache: this.cache,
        image: (id) => this.sources.image(id),
        maskSource: (maskLayer) => this.layer(maskLayer, frame),
        mask: (id) => {
          const maskLayer = geometry.byId.get(id);
          if (!maskLayer) throw new Error(`Calque masque introuvable : ${id}`);
          return maskLayer;
        },
      });
    entry.output = source;
    entry.signature = signature;
    return source;
  }

  private children(
    parentId: string | null,
    width: number,
    height: number,
    background: string,
    entry: LayerTargets,
    key: string,
    frame: RenderFrame,
    window?: GroupViewport | null,
  ): FrameTexture {
    const { scale, geometry } = frame;
    const viewport = window?.bounds ?? { x: 0, y: 0, width, height };
    const pixelWidth = window?.pixelWidth ?? rasterExtent(width, scale);
    const pixelHeight = window?.pixelHeight ?? rasterExtent(height, scale);
    let target = this.target(entry, key, "children-a", pixelWidth, pixelHeight);
    this.passes!.clear(target, background);
    const layers = window?.empty ? [] : geometry.children(parentId);
    let batch: { layer: Layer; source: FrameTexture }[] = [],
      primitiveRun: Layer[] = [];
    const flush = () => {
      this.normal!.draw(batch, viewport.width, viewport.height, target, viewport);
      batch = [];
    };
    const flushPrimitives = () => {
      if (!primitiveRun.length) return;
      this.cache.ensureCapacity(
        "shared-primitives",
        this.primitives!.projectedBytes(primitiveRun.length),
      );
      try {
        this.primitives!.draw(
          primitiveRun,
          viewport.width,
          viewport.height,
          scale,
          target,
          viewport,
        );
      } finally {
        this.cache.synchronize("shared-primitives");
      }
      primitiveRun = [];
    };
    for (const layer of layers) {
      if (!layer.visible || layer.opacity <= 0 || layer.maskSource) continue;
      if (isInstancedPrimitive(layer)) {
        flush();
        primitiveRun.push(layer);
        continue;
      }
      flushPrimitives();
      const source = this.layer(layer, frame, viewport);
      if (layer.blendMode === "normal") {
        batch.push({ layer, source });
        continue;
      }
      flush();
      const next = this.target(
        entry,
        key,
        target === entry.target("children-a", pixelWidth, pixelHeight)
          ? "children-b"
          : "children-a",
        pixelWidth,
        pixelHeight,
      );
      this.passes!.blendTo(
        target.texture,
        source,
        layer,
        viewport.width,
        viewport.height,
        next,
        viewport,
      );
      target = next;
    }
    flushPrimitives();
    flush();
    return {
      texture: target.texture,
      width: pixelWidth,
      height: pixelHeight,
      premultiplied: true,
      ...(window ? { bounds: window.bounds } : {}),
    };
  }
  stats(): GpuStats {
    const cache = this.cache.stats();
    const effects = this.effects?.stats();
    return {
      passes:
        this.proofPasses +
        (this.sources.videoStats()?.passes ?? 0) +
        (this.passes?.passes ?? 0) +
        (this.normal?.passes ?? 0) +
        (this.primitives?.passes ?? 0) +
        (this.vectors?.passes ?? 0) +
        (this.spatial?.passes ?? 0) +
        this.texts.passes +
        (this.color?.passes ?? 0) +
        (effects?.passes ?? 0),
      readbacks: 0,
      profile: this.profile
        ? {
            pipeline: [...this.profile.pipeline],
            sources: [...this.profile.sources],
            text: [...this.profile.text],
            compose: [...this.profile.compose],
          }
        : null,
      video: this.sources.videoStats(),
      spatial: this.currentSpatial,
      uploads: this.sources.uploads + this.texts.parses + (this.spatial?.parses ?? 0),
      targets: cache.targets,
      cacheBytes: cache.cacheBytes,
      cacheEntries: cache.entries,
      frames: this.frames,
      cacheHits: this.cacheHits,
      vectorParses: this.vectors?.parses ?? 0,
      maxBytes: cache.maxBytes,
      primitiveDraws: this.primitives?.passes ?? 0,
      primitiveInstances: this.primitives?.instances ?? 0,
      primitiveBytes: this.primitives?.bytes ?? 0,
    };
  }
  spatialSource(layerId: string) {
    return this.spatial?.peek(layerId) ?? null;
  }
  /** Exact/export adapters await native source uploads; interactive preview pipelines them. */
  settleMedia(): Promise<void> {
    return this.sources.settle();
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    this.disposal = this.queue.then(async () => {
      const failures: unknown[] = [];
      try {
        await this.sources.dispose();
      } catch (error) {
        failures.push(error);
      }
      for (const release of [
        () => this.spatial?.dispose(),
        () => this.cache.clear(),
        () => this.passes?.dispose(),
        () => this.normal?.dispose(),
        () => this.color?.dispose(),
        () => this.texts.dispose(),
      ]) {
        try {
          release();
        } catch (error) {
          failures.push(error);
        }
      }
      this.effects = null;
      this.passes = null;
      this.normal = null;
      this.primitives = null;
      this.vectors = null;
      this.color = null;
      if (failures.length) throw new AggregateError(failures, "GPU compositor cleanup failed.");
    });
    return this.disposal;
  }
}
