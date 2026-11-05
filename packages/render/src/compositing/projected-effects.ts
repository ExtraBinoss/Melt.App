import type { Bounds, Layer } from "@musart/core";
import { Matrix3, Vector3 } from "three/webgpu";
import type { RenderTarget } from "three/webgpu";
import type { GpuPasses } from "./passes";
import { rasterExtent, type FrameTexture } from "./types";

interface Context {
  passes: GpuPasses;
  target(role: string, width: number, height: number, mipmapped?: boolean): RenderTarget;
}

/** A bounded image rectangle, snapped to the authored reference lattice. */
export function projectedEffectBounds(bounds: Bounds, matrix: Matrix3, scale: number): Bounds {
  const points = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x, bounds.y + bounds.height],
    [bounds.x + bounds.width, bounds.y + bounds.height],
  ].map(([x, y]) => {
    const point = new Vector3(x!, y!, 1).applyMatrix3(matrix);
    if (!Number.isFinite(point.z) || Math.abs(point.z) < 0.000001)
      throw new RangeError("Spatial effect plane crosses the projection horizon.");
    return { x: point.x / point.z, y: point.y / point.z };
  });
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
  const width = rasterExtent(bounds.width, scale),
    height = rasterExtent(bounds.height, scale);
  const target = context.target("effect-plane-source", width, height);
  context.passes.projectTo(source, original, target, bounds, toSource.elements);
  return {
    bounds,
    source: { texture: target.texture, width, height, premultiplied: source.premultiplied, bounds },
    restore(effect: FrameTexture, effectBounds: Bounds, expands: boolean): FrameTexture {
      const destination = expands ? projectedEffectBounds(effectBounds, toSource, scale) : original;
      const premultiplied = context.target(
        "effect-plane-premultiplied",
        effect.width,
        effect.height,
      );
      context.passes.copyTo(effect, premultiplied, false, !effect.premultiplied);
      const output = context.target(
        "effect-plane-projected",
        rasterExtent(destination.width, scale),
        rasterExtent(destination.height, scale),
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
