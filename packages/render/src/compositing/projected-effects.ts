import type { Bounds, Layer } from "@musart/core";
import { Matrix3 } from "three/webgpu";
import type { RenderTarget } from "three/webgpu";
import type { GpuPasses } from "./passes";
import type { FrameTexture } from "./types";
import { projectedRaster } from "./projected-raster";
import { clipProjectedBounds, finiteProjectedPoints } from "./projected-window";

interface Context {
  passes: GpuPasses;
  maxTextureDimension?: number;
  effectPixelBudget?: number;
  effectWindow?: Bounds;
  target(role: string, width: number, height: number, mipmapped?: boolean): RenderTarget;
}

/** A bounded image rectangle, snapped to the authored reference lattice. */
export function projectedEffectBounds(bounds: Bounds, matrix: Matrix3, scale: number): Bounds {
  const points = finiteProjectedPoints(bounds, matrix);
  if (!points.length) throw new RangeError("Spatial effect plane crosses the projection horizon.");
  const x = Math.floor(Math.min(...points.map((p) => p.x)) * scale) / scale;
  const y = Math.floor(Math.min(...points.map((p) => p.y)) * scale) / scale;
  const right = Math.ceil(Math.max(...points.map((p) => p.x)) * scale) / scale;
  const bottom = Math.ceil(Math.max(...points.map((p) => p.y)) * scale) / scale;
  if (![x, y, right, bottom].every(Number.isFinite))
    throw new RangeError("Invalid spatial effect bounds.");
  return { x, y, width: Math.max(1 / scale, right - x), height: Math.max(1 / scale, bottom - y) };
}

/** Reframe the complete stack once, so every effect and SDK control uses the same object pixels. */
export function prepareProjectedEffects(
  source: FrameTexture,
  original: Bounds,
  layer: Layer,
  scale: number,
  projection: readonly number[],
  context: Context,
) {
  const toAuthor = new Matrix3().fromArray(projection),
    toSource = toAuthor.clone().invert();
  const mapped = projectedEffectBounds(original, toAuthor, scale);
  const x = Math.min(0, mapped.x),
    y = Math.min(0, mapped.y);
  const bounds = {
    x,
    y,
    width: Math.ceil(Math.max(layer.width, mapped.x + mapped.width) * scale) / scale - x,
    height: Math.ceil(Math.max(layer.height, mapped.y + mapped.height) * scale) / scale - y,
  };
  const maxDimension = context.maxTextureDimension ?? 8192;
  const maxPixels = context.effectPixelBudget ?? 6 * 1024 * 1024;
  const raster = projectedRaster(bounds, scale, maxDimension, maxPixels);
  const { width, height } = raster;
  const target = context.target("effect-plane-source", width, height);
  context.passes.projectTo(source, original, target, bounds, toSource.elements);
  return {
    bounds,
    scale: raster.scale,
    raster: (region: Bounds) => projectedRaster(region, raster.scale, maxDimension, maxPixels),
    source: { texture: target.texture, width, height, premultiplied: source.premultiplied, bounds },
    restore(effect: FrameTexture, effectBounds: Bounds, expands: boolean): FrameTexture {
      const destination = expands
        ? clipProjectedBounds(effectBounds, toSource, context.effectWindow ?? original)
        : original;
      const outputRaster = projectedRaster(destination, scale, maxDimension, maxPixels);
      const premultiplied = context.target(
        "effect-plane-premultiplied",
        effect.width,
        effect.height,
      );
      context.passes.copyTo(effect, premultiplied, false, !effect.premultiplied);
      const output = context.target(
        "effect-plane-projected",
        outputRaster.width,
        outputRaster.height,
      );
      context.passes.projectTo(
        { ...effect, texture: premultiplied.texture, premultiplied: true },
        effectBounds,
        output,
        destination,
        toAuthor.elements,
      );
      return {
        texture: output.texture,
        width: output.width,
        height: output.height,
        premultiplied: true,
        bounds: destination,
      };
    },
  };
}
