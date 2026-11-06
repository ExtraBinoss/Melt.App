import type { Bounds, Layer } from "@musart/core";
import type { RenderTarget } from "three/webgpu";
import type { GpuResourceCache } from "../cache/GpuResourceCache";
import type { TextureSources } from "../surface/TextureSources";
import type { TextSources } from "../surface/text/source";
import type { VectorSources } from "../surface/vector/source";
import type { SpatialSources } from "../spatial/SpatialSources";
import type { ColorPipeline } from "../color/ColorPipeline";
import type { GpuPasses } from "./passes";
import type { EffectResources } from "./effect-resources";
import type { LayerTargets } from "./targets";
import type { RenderFrame } from "./render-frame";
import { drawLayerSource, isSrgbLayerSource } from "./layer-source";
import { finishLayerSource, layerEffectCache } from "./finish-layer";
import { historicalEffectBounds, layerEffectInputs } from "./effect-inputs";
import { hasEffectTreatment } from "../effects/shared/active";
import { groupViewport, type GroupViewport } from "./group-viewport";
import { rasterExtent, type FrameTexture } from "./types";
import { projectedEffectWindow } from "./projected-window";

interface Context {
  maxTextureDimension: number;
  sources: TextureSources;
  texts: TextSources;
  vectors: VectorSources;
  spatial: SpatialSources | null;
  passes: GpuPasses;
  effects: EffectResources;
  color: ColorPipeline;
  cache: GpuResourceCache;
  cacheHit(): void;
  entry(key: string): LayerTargets;
  target(
    entry: LayerTargets,
    key: string,
    role: string,
    width: number,
    height: number,
    mipmapped?: boolean,
    samples?: number,
  ): RenderTarget;
  children(
    layer: Layer,
    entry: LayerTargets,
    key: string,
    frame: RenderFrame,
    viewport?: GroupViewport | null,
  ): FrameTexture;
  layer(layer: Layer, frame: RenderFrame, parentViewport?: Bounds): FrameTexture;
}
/** Prepare one ordinary or windowed source before its effects and masks. */
export function renderLayer(
  layer: Layer,
  frame: RenderFrame,
  parentViewport: Bounds | undefined,
  context: Context,
): FrameTexture {
  const backgroundWindow =
    frame.backgroundId === layer.id
      ? (frame.viewport ?? { x: 0, y: 0, width: frame.page.width, height: frame.page.height })
      : undefined;
  const background = backgroundWindow
    ? { ...backgroundWindow, x: backgroundWindow.x - layer.x, y: backgroundWindow.y - layer.y }
    : undefined;
  const treatment =
    layer.effects.some(hasEffectTreatment) || !!layer.mask?.enabled || !!layer.clipping;
  const reference = !background && treatment;
  // Exact frames retain authored references; previews may request bounded raster density.
  if (reference && (frame.scale !== frame.referenceScale || frame.vectorAntialias))
    frame = {
      ...frame,
      scale: frame.referenceScale,
      vectorAntialias: false,
      keyFor: frame.referenceKeyFor,
    };
  const { page, scale, keyFor, geometry, vectorAntialias } = frame;
  const viewport =
    layer.kind === "group" && !reference
      ? groupViewport(layer, scale, parentViewport, context.maxTextureDimension)
      : null;
  const key = `layer:${page.id}:${layer.id}:${scale}${viewport ? ":window" : ""}${vectorAntialias ? ":vector-aa" : ""}${backgroundWindow ? `:viewport:${JSON.stringify(backgroundWindow)}` : ""}`;
  const entry = context.entry(key);
  const signature = viewport
    ? JSON.stringify([keyFor(layer), viewport.key])
    : background
      ? JSON.stringify([keyFor(layer), background])
      : keyFor(layer);
  if (entry.signature === signature && entry.output) {
    context.cacheHit();
    return entry.output;
  }
  entry.signature = "";
  const width = rasterExtent(layer.width, scale);
  const height = rasterExtent(layer.height, scale);
  let source: FrameTexture;
  if (background) {
    const target = context.target(
      entry,
      key,
      "background",
      rasterExtent(background.width, scale),
      rasterExtent(background.height, scale),
    );
    context.passes.clear(target, layer.fill, layer.fillGradient, {
      width: layer.width,
      height: layer.height,
      region: background,
    });
    source = {
      texture: target.texture,
      width: target.width,
      height: target.height,
      premultiplied: true,
      bounds: background,
    };
  } else
    source = drawLayerSource(layer, {
      width,
      height,
      scale,
      vectorAntialias,
      displayP3: page.colorSpace === "display-p3",
      entry,
      sources: context.sources,
      texts: context.texts,
      vectors: context.vectors,
      spatial: context.spatial,
      passes: context.passes,
      target: (role, samples = 0, w = width, h = height) =>
        context.target(entry, key, role, w, h, false, samples),
      children: () => context.children(layer, entry, key, frame, viewport),
    });
  if (page.colorSpace === "display-p3" && isSrgbLayerSource(layer)) {
    const converted = context.target(entry, key, "working-color", source.width, source.height);
    context.color.render(source, converted, "to-p3");
    source = { ...source, texture: converted.texture };
  }
  if (treatment)
    source = finishLayerSource(layer, page, scale, source, {
      target: (role, w, h, mipmapped) => context.target(entry, key, role, w, h, mipmapped),
      passes: context.passes,
      effects: context.effects,
      cache: context.cache,
      historyBounds: historicalEffectBounds(
        page,
        layer,
        frame.history,
        context.spatial?.effectProjection(layer.id),
      ),
      auxiliary: (bounds) =>
        layerEffectInputs(
          page,
          layer,
          bounds,
          context.spatial,
          frame.history,
          context.spatial?.effectProjection(layer.id),
        ),
      ...(layer.spatial?.enabled
        ? {
            effectProjection: context.spatial?.effectProjection(layer.id),
            effectWindow: projectedEffectWindow(page, layer, frame.viewport),
          }
        : {}),
      ...(layer.spatial?.enabled || layer.effects.some((effect) => effect.type === "trail")
        ? {
            maxTextureDimension: context.maxTextureDimension,
            // Bound expanded Trail transports and retained copy/scratch surfaces together.
            effectPixelBudget: Math.max(1, Math.floor(context.cache.maxBytes / 96)),
          }
        : {}),
      ...layerEffectCache(
        layer,
        entry,
        background ? (source) => JSON.stringify([keyFor(source), background]) : keyFor,
      ),
      image: (id, ownerId) =>
        ownerId ? context.sources.maskImage(id, ownerId) : context.sources.image(id),
      maskSource: (maskLayer) =>
        context.layer(maskLayer, frame.capture ? { ...frame, capture: undefined } : frame),
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
