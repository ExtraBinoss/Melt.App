import { renderChildren } from "./children-renderer";
import { CapturePaint } from "./capture-paint";
import { compositionDepthInputs } from "./effect-inputs";
import { TemporalEffectSources } from "../effects/trail/TemporalEffectSources";
import { compositionViewport, viewportBackground } from "./composition-viewport";
import { finishCompositionEffects, prepareEffectStacks } from "./composition-effects";
import { assetIdentity } from "../cache/keys";
import { compositionPaintKey } from "../cache/composition-key";
import { PlaybackSubmissions } from "../cache/playback-submissions";
import type { RenderFrame } from "./render-frame";
import { completeGpuFrame, isGraphicsPlayback } from "./publication";
import { renderLayer } from "./layer-renderer";
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
import { frameSourceKeys, referenceDensity } from "./frame-source-keys";
import { SourceKeyCache } from "../cache/source-key-cache";
import { sameCompositionInput } from "../cache/composition-input";
import { EffectResources } from "./effect-resources";
import { VectorSources } from "../surface/vector/source";
import { TextureSources } from "../surface/TextureSources";
import { TextSources } from "../surface/text/source";
import type { FontResolver } from "../surface/text/fonts";
import { PrimitiveBatch } from "./primitives/batch";
import { NormalBatch } from "./normal-batch";
import { GpuPasses } from "./passes";
import { LayerTargets } from "./targets";
import type { GroupViewport } from "./group-viewport";
import { assertRenderSize, type FrameTexture, type GpuStats, type RenderOptions } from "./types";
/** Retained GPU graph. Only font/image preparation awaits; all GPU submissions are synchronous. */
export class GpuCompositor {
  private readonly maxTextureDimension: number;
  private readonly cache: GpuResourceCache;
  private readonly sources: TextureSources;
  private readonly fontResolver?: FontResolver;
  private readonly texts: TextSources;
  private readonly submissions: PlaybackSubmissions;
  private readonly sourceKeys = new SourceKeyCache();
  private effects: EffectResources | null = null;
  private temporal: TemporalEffectSources | null = null;
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
    this.submissions = new PlaybackSubmissions(renderer);
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
      ([page, ...page.layers].some((owner) =>
        owner.effects?.some((effect) => effect.type === "trail" && effect.enabled),
      ) &&
        input.motionFrame !== motionFrame) ||
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
      const referenceScale = referenceDensity(options);
      assertRenderSize(page, scale);
      const window = compositionViewport(scale, options.viewport);
      this.cache.beginFrame(this.retainedRoot);
      if (
        options.history !== "disabled" &&
        [page, ...page.layers].some((owner) =>
          owner.effects?.some((effect) => effect.type === "trail" && effect.enabled),
        )
      ) {
        this.temporal ??= new TemporalEffectSources(
          this.renderer,
          this.cache.maxBytes,
          (maxBytes) =>
            new GpuCompositor(this.renderer, { maxBytes, fontResolver: this.fontResolver }),
          (bytes) => this.cache.reserveExternal("temporal-effects", bytes),
        );
      }
      const history = await this.temporal?.prepare(page, assets, options);
      this.cache.get("shared-effects");
      this.cache.get("shared-primitives");
      if (options.canRender && !options.canRender())
        throw new DOMException("Rendering deferred.", "AbortError");
      this.passes ??= new GpuPasses(this.renderer);
      this.normal ??= new NormalBatch(this.renderer);
      this.vectors ??= new VectorSources(this.renderer, this.cache);
      this.color ??= new ColorPipeline(this.renderer);
      if (!this.effects) {
        this.effects = new EffectResources(this.renderer, (assetId) => this.sources.image(assetId));
        this.cache.set("shared-effects", this.effects);
      }
      if (!this.primitives) {
        this.primitives = new PrimitiveBatch(this.renderer);
        this.cache.set("shared-primitives", this.primitives);
      }
      const geometry = createLayerGeometryIndex(page);
      const capture = options.effectCaptureOwnerId
        ? new CapturePaint(geometry, options.effectCaptureOwnerId)
        : undefined;
      const paintedPage = capture?.preparationPage(page, geometry) ?? page;
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
      if (
        page.colorSpace === "cmyk" &&
        options.colorOutput !== "source" &&
        !options.effectCapture
      ) {
        proof = this.cache.get<PrintProofPass>("print-proof");
        if (!proof) {
          proof = new PrintProofPass(this.renderer);
          this.cache.set("print-proof", proof);
        }
        await proof.prepare(preparationTarget, canPrepare);
      }
      await this.passes.prepare(preparationTarget, canPrepare);
      await prepareEffectStacks(
        paintedPage,
        this.effects,
        this.cache,
        preparationTarget,
        canPrepare,
      );
      await this.normal.prepare(
        paintedPage.layers,
        preparationTarget,
        canPrepare,
        viewportBackground(page, options.viewport),
      );
      this.sample("pipeline", pipelineStarted, options.profileVideo);
      const sourceStarted = options.profileVideo ? performance.now() : 0;
      await this.sources.prepare(paintedPage, assets, options);
      this.sample("sources", sourceStarted, options.profileVideo);
      const textStarted = options.profileVideo ? performance.now() : 0;
      await this.texts.prepare(paintedPage, {
        target: preparationTarget,
        canContinue: canPrepare,
        profile: options.profileVideo,
      });
      this.sample("text", textStarted, options.profileVideo);
      if (this.spatial || page.layers.some((layer) => layer.spatial?.enabled)) {
        this.spatial ??= new (await import("../spatial/SpatialSources")).SpatialSources(
          this.renderer,
          this.cache,
          { fontResolver: options.fontResolver ?? this.fontResolver },
        );
        const started = options.profileVideo ? performance.now() : 0;
        await this.spatial.prepare(page, assets, scale, preparationTarget, canPrepare, options);
        if (options.profileVideo && this.profile)
          this.profile.sources[this.profile.sources.length - 1]! += performance.now() - started;
      }
      const composeStarted = options.profileVideo ? performance.now() : 0;
      if (options.canRender && !options.canRender())
        throw new DOMException("Rendering deferred.", "AbortError");
      if (this.disposed) throw new Error("Le compositeur GPU est fermé.");
      const keyOptions = {
        cache: this.sourceKeys,
        immutableFrame: options.immutableFrame,
        geometry,
        videoStamp: (id: string) => this.sources.videoStamp(id),
        spatialStamp: (id: string) => this.spatial?.reflectionStamp(id) ?? null,
      };
      const { density, keyFor, referenceKeyFor } = frameSourceKeys(
        page,
        assets,
        options,
        keyOptions,
      );
      const historyStamp = history?.size
        ? `:history:${options.motionFrame?.time.value}/${options.motionFrame?.time.rate}`
        : "";
      const affected = new Set<string>();
      for (const layer of page.layers)
        if (layer.effects.some((effect) => history?.has(effect.id))) {
          let current: Layer | undefined = layer;
          while (current) {
            affected.add(current.id);
            current = current.parentId ? geometry.byId.get(current.parentId) : undefined;
          }
        }
      const stampedKey = (key: (layer: Layer) => string) => (layer: Layer) =>
        key(layer) +
        (affected.has(layer.id) ? historyStamp : "") +
        (capture ? `:capture:${capture.ownerId}` : "");
      const frame: RenderFrame = {
        page,
        viewport: options.viewport,
        backgroundId: capture ? undefined : viewportBackground(page, options.viewport),
        history,
        capture,
        scale,
        referenceScale,
        vectorAntialias: !!options.vectorAntialias,
        keyFor: stampedKey(keyFor),
        referenceKeyFor: stampedKey(referenceKeyFor),
        geometry,
      };
      const rootKey = `page:${page.id}:${scale}${options.colorOutput === "source" ? ":source" : ""}${frame.vectorAntialias ? ":vector-aa" : ""}${density}${options.effectCapture ? `:capture:${options.effectCaptureOwnerId ?? "composition"}` : ""}${window ? `:viewport:${window.key}` : ""}`;
      const entry = this.entry(rootKey);
      const roots = geometry.children(null);
      const signature =
        compositionPaintKey(page, roots, frame.keyFor, (id) => assetIdentity(assets[id])) +
        (history?.size
          ? `:history:${options.motionFrame?.time.value}/${options.motionFrame?.time.rate}`
          : "");
      if (entry.signature === signature && entry.output) {
        this.cacheHits++;
        this.frames++;
        this.retainedRoot = rootKey;
        this.rememberInput(entry, page, assets, options.motionFrame);
        this.sample("compose", composeStarted, options.profileVideo);
        return entry.output;
      }
      if (isGraphicsPlayback(options)) await this.submissions.admit(options.signal);
      entry.signature = "";
      const blended = this.children(
        null,
        page.width,
        page.height,
        capture ? "transparent" : page.background,
        entry,
        rootKey,
        frame,
        window,
      );
      const composed = finishCompositionEffects(page, blended, {
        passes: this.passes,
        effects: this.effects,
        cache: this.cache,
        history,
        ...compositionDepthInputs(this.spatial),
        target: (role, width, height) => this.target(entry, rootKey, role, width, height),
      });
      const target = this.target(
        entry,
        rootKey,
        entry.nextPresentationRole(),
        composed.width,
        composed.height,
      );
      if (options.effectCapture) this.passes.copyTo(composed, target);
      else if (proof) {
        proof.render(composed, target);
        this.proofPasses++;
      } else if (page.colorSpace === "display-p3") this.color.render(composed, target, "to-srgb");
      else if (page.colorSpace === "cmyk-proof") this.color.render(composed, target, "cmyk-proof");
      else this.passes.copyTo(composed, target);
      entry.output = {
        ...(await completeGpuFrame(this.renderer, target, options)),
        ...(window ? { bounds: window.bounds } : {}),
      };
      if (isGraphicsPlayback(options)) this.submissions.submitted();
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
    return renderLayer(layer, frame, parentViewport, {
      maxTextureDimension: this.maxTextureDimension,
      sources: this.sources,
      texts: this.texts,
      vectors: this.vectors!,
      spatial: this.spatial,
      passes: this.passes!,
      effects: this.effects!,
      color: this.color!,
      cache: this.cache,
      cacheHit: () => {
        this.cacheHits++;
      },
      entry: (key) => this.entry(key),
      target: (...args) => this.target(...args),
      layer: (...args) => this.layer(...args),
      children: (layer, entry, key, frame, viewport) =>
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
    return renderChildren(parentId, width, height, background, entry, key, frame, window, {
      cache: this.cache,
      passes: this.passes!,
      normal: this.normal!,
      primitives: this.primitives!,
      target: (...args) => this.target(...args),
      layer: (...args) => this.layer(...args),
    });
  }

  stats(): GpuStats {
    const cache = this.cache.stats();
    const effects = this.effects?.stats();
    const temporal = this.temporal?.stats();
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
        (effects?.passes ?? 0) +
        (temporal?.passes ?? 0),
      readbacks: 0,
      effectPasses: (effects?.passes ?? 0) + (temporal?.effectPasses ?? 0),
      sourceDependencies: this.sourceKeys.stats(),
      profile: this.profile
        ? {
            pipeline: [...this.profile.pipeline],
            sources: [...this.profile.sources],
            text: [...this.profile.text],
            compose: [...this.profile.compose],
          }
        : null,
      video: this.sources.videoStats(),
      text: this.texts.stats(),
      submission: this.submissions.stats(),
      spatial: this.currentSpatial,
      uploads:
        this.sources.uploads +
        this.texts.parses +
        (this.spatial?.parses ?? 0) +
        (temporal?.uploads ?? 0),
      targets: cache.targets + (temporal?.targets ?? 0),
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
      for (const settle of [
        () => this.temporal?.dispose(),
        () => this.sources.dispose(),
        () => this.submissions.dispose(),
      ]) {
        try {
          await settle();
        } catch (error) {
          failures.push(error);
        }
      }
      for (const release of [
        () => this.spatial?.dispose(),
        () => this.cache.clear(),
        () => this.sourceKeys.clear(),
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
