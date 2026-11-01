import type { TemporalEffectInputs } from "../effects/GpuEffects";
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
import { rasterExtent, type FrameTexture } from "./types";

interface Context {
  temporal?: TemporalEffectInputs;
  target(role: string, width: number, height: number, mipmapped?: boolean): RenderTarget;
  passes: GpuPasses;
  effects: EffectResources;
  cache: GpuResourceCache;
  mask(id: string): Layer;
  maskSource(layer: Layer): FrameTexture;
  image(id: string): FrameTexture["texture"];
}
const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];

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
  if (enabled) {
    const outset = effectFootprint(effects);
    bounds = {
      x: original.x - outset.left,
      y: original.y - outset.top,
      width: original.width + outset.left + outset.right,
      height: original.height + outset.top + outset.bottom,
    };
    for (const effect of effects) {
      const history = context.temporal?.get(effect.id)?.bounds;
      if (history) {
        const x = Math.min(bounds.x, history.x),
          y = Math.min(bounds.y, history.y);
        bounds = {
          x,
          y,
          width: Math.max(bounds.x + bounds.width, history.x + history.width) - x,
          height: Math.max(bounds.y + bounds.height, history.y + history.height) - y,
        };
      }
    }
    const width = rasterExtent(bounds.width, scale),
      height = rasterExtent(bounds.height, scale);
    if (
      source.premultiplied ||
      bounds.x !== original.x ||
      bounds.y !== original.y ||
      bounds.width !== original.width ||
      bounds.height !== original.height
    ) {
      const straight = context.target("straight", width, height);
      context.passes.copyTo(source, straight, source.premultiplied, false, {
        x: (bounds.x - original.x) / original.width,
        y: 1 - (bounds.y - original.y + bounds.height) / original.height,
        width: bounds.width / original.width,
        height: bounds.height / original.height,
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
        texture: context.effects.apply(
          source.texture,
          width,
          height,
          effects,
          output,
          {
            width: bounds.width,
            height: bounds.height,
            origin: { x: bounds.x, y: bounds.y },
            content: {
              x: original.x - bounds.x,
              y: original.y - bounds.y,
              width: original.width,
              height: original.height,
            },
          },
          context.temporal,
        ),
        width,
        height,
        premultiplied: false,
      };
    } finally {
      context.cache.synchronize("shared-effects");
    }
    if (bounds.x || bounds.y || bounds.width !== layer.width || bounds.height !== layer.height)
      source.bounds = bounds;
  }
  const { width, height } = source;
  if (layer.mask?.enabled) {
    const target = context.target("mask", width, height),
      mask = layer.mask;
    if (mask.assetId) {
      context.passes.maskTo(source, context.image(mask.assetId), mask.inverted, target, {
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
  if (enabled || layer.mask?.enabled) {
    const filtered = context.target("reference", width, height, true);
    context.passes.copyTo(source, filtered, false, !source.premultiplied);
    source = { ...source, texture: filtered.texture, premultiplied: true };
  }
  return source;
}
