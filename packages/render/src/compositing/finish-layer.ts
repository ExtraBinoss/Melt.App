import { hasEffectTreatment } from "../effects/shared/active";
import {
  multiplyMatrices,
  type Bounds,
  type Composition,
  type Layer,
  type Matrix,
} from "@musart/core";
import type { RenderTarget } from "three/webgpu";
import type { GpuResourceCache } from "../cache/GpuResourceCache";
import { effectFootprint } from "../effects/shared/footprint";
import { maskLayerMapping } from "./mask-binding";
import type { EffectResources } from "./effect-resources";
import type { GpuPasses } from "./passes";
import type { LayerTargets } from "./targets";
import { rasterExtent, type FrameTexture } from "./types";
import { prepareProjectedEffects } from "./projected-effects";

interface Context {
  target(role: string, width: number, height: number, mipmapped?: boolean): RenderTarget;
  passes: GpuPasses;
  effects: EffectResources;
  cache: GpuResourceCache;
  mask(id: string): Layer;
  maskSource(layer: Layer): FrameTexture;
  image(id: string, ownerId?: string): FrameTexture["texture"];
  effectCache?: { entry: LayerTargets; signature: string };
  effectProjection?: readonly number[];
}
const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];

/** Effect pixels precede both masks; moving either mask must not invalidate those pixels. */
export function layerEffectCache(
  layer: Layer,
  entry: LayerTargets,
  keyFor: (source: Layer) => string,
): Pick<Context, "effectCache"> {
  if (!layer.effects.some(hasEffectTreatment)) return {};
  const { clipping: _clipping, ...source } = layer;
  return { effectCache: { entry, signature: keyFor({ ...source, mask: null }) } };
}

/** Finish source-local effects, masks and reference filtering with an explicit transport rectangle. */
export function finishLayerSource(
  layer: Layer,
  page: Composition,
  scale: number,
  input: FrameTexture,
  context: Context,
): FrameTexture {
  let source = input;
  const original: Bounds = input.bounds ?? { x: 0, y: 0, width: layer.width, height: layer.height };
  let bounds: Bounds = original;
  const effects = layer.effects.filter(hasEffectTreatment);
  const enabled = effects.length > 0;
  const retained = context.effectCache?.entry.effectSource;
  if (enabled && retained && retained.signature === context.effectCache?.signature) {
    source = retained.output;
    bounds = source.bounds ?? original;
  } else if (enabled) {
    // The owned target may be overwritten before an operator throws. A failed
    // render must never leave its previous signature attached to partial pixels.
    if (context.effectCache) context.effectCache.entry.effectSource = null;
    const projected = context.effectProjection
      ? prepareProjectedEffects(source, original, layer, scale, context.effectProjection, context)
      : null;
    if (projected) source = projected.source;
    const effectOriginal = projected?.bounds ?? original;
    const outset = effectFootprint(effects);
    bounds = {
      x: effectOriginal.x - outset.left,
      y: effectOriginal.y - outset.top,
      width: effectOriginal.width + outset.left + outset.right,
      height: effectOriginal.height + outset.top + outset.bottom,
    };
    const width = rasterExtent(bounds.width, scale),
      height = rasterExtent(bounds.height, scale);
    if (source.premultiplied || outset.left || outset.top || outset.right || outset.bottom) {
      const straight = context.target("straight", width, height);
      context.passes.copyTo(source, straight, source.premultiplied, false, {
        x: (bounds.x - effectOriginal.x) / effectOriginal.width,
        y: 1 - (bounds.y - effectOriginal.y + bounds.height) / effectOriginal.height,
        width: bounds.width / effectOriginal.width,
        height: bounds.height / effectOriginal.height,
      });
      source = { texture: straight.texture, width, height, premultiplied: false };
    }
    const output = context.target("effects", width, height);
    context.cache.ensureCapacity(
      "shared-effects",
      context.effects.projectedBytes(width, height, effects),
    );
    try {
      source = {
        texture: context.effects.apply(source.texture, width, height, effects, output, {
          width: bounds.width,
          height: bounds.height,
          // Transport bounds may be a viewport crop or expansion. Effect fields
          // and their area controls remain anchored to the authored layer frame.
          content: {
            x: -bounds.x,
            y: -bounds.y,
            width: layer.width,
            height: layer.height,
          },
        }),
        width,
        height,
        premultiplied: false,
      };
    } finally {
      context.cache.synchronize("shared-effects");
    }
    if (bounds.x || bounds.y || bounds.width !== layer.width || bounds.height !== layer.height)
      source.bounds = bounds;
    if (projected) {
      source = projected.restore(
        source,
        bounds,
        Boolean(outset.left || outset.top || outset.right || outset.bottom),
      );
      bounds = source.bounds!;
    }
    if (context.effectCache)
      context.effectCache.entry.effectSource = {
        signature: context.effectCache.signature,
        output: source,
      };
  }
  const { width, height } = source;
  const masks = [
    layer.mask,
    layer.clipping
      ? { layerId: layer.clipping.layerId, enabled: true, inverted: false, mode: "alpha" as const }
      : undefined,
  ];
  for (const [index, mask] of masks.entries()) {
    if (!mask?.enabled) continue;
    const target = context.target(index ? "clipping" : "mask", width, height);
    if (mask.assetId) {
      context.passes.maskTo(source, context.image(mask.assetId, layer.id), mask.inverted, target, {
        luminance: mask.mode === "luminance",
        transformed: true,
        targetWidth: bounds.width,
        targetHeight: bounds.height,
        sourceWidth: layer.width,
        sourceHeight: layer.height,
        matrix: translate(bounds.x, bounds.y),
      });
    } else if (mask.layerId) {
      const maskLayer = context.mask(mask.layerId);
      const mapping = maskLayerMapping(page, layer, maskLayer, false);
      if (index) {
        mapping.luminance = false;
        mapping.opacity = mapping.opacity > 0 ? maskLayer.opacity : 0;
      }
      const content = mapping.opacity > 0 ? context.maskSource(maskLayer) : source;
      mapping.premultiplied = content.premultiplied;
      const maskBounds = content.bounds;
      mapping.matrix = multiplyMatrices(
        translate(-(maskBounds?.x ?? 0), -(maskBounds?.y ?? 0)),
        multiplyMatrices(mapping.matrix, translate(bounds.x, bounds.y)),
      );
      mapping.sourceWidth = maskBounds?.width ?? mapping.sourceWidth;
      mapping.sourceHeight = maskBounds?.height ?? mapping.sourceHeight;
      mapping.targetWidth = bounds.width;
      mapping.targetHeight = bounds.height;
      context.passes.maskTo(source, content.texture, mask.inverted, target, mapping);
    } else throw new Error("Source de masque absente.");
    source = { ...source, texture: target.texture };
  }
  if (enabled || layer.mask?.enabled || layer.clipping) {
    const filtered = context.target("reference", width, height, true);
    context.passes.copyTo(source, filtered, false, !source.premultiplied);
    source = { ...source, texture: filtered.texture, premultiplied: true };
  }
  return source;
}
