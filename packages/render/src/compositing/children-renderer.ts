import type { Bounds, Layer } from "@musart/core";
import type { RenderTarget } from "three/webgpu";
import type { GpuResourceCache } from "../cache/GpuResourceCache";
import { isInstancedPrimitive } from "./primitives/eligibility";
import type { PrimitiveBatch } from "./primitives/batch";
import type { NormalBatch } from "./normal-batch";
import type { GpuPasses } from "./passes";
import type { LayerTargets } from "./targets";
import type { RenderFrame } from "./render-frame";
import type { GroupViewport } from "./group-viewport";
import { rasterExtent, type FrameTexture } from "./types";
interface Context {
  cache: GpuResourceCache;
  passes: GpuPasses;
  normal: NormalBatch;
  primitives: PrimitiveBatch;
  target(
    entry: LayerTargets,
    key: string,
    role: string,
    width: number,
    height: number,
  ): RenderTarget;
  layer(layer: Layer, frame: RenderFrame, viewport?: Bounds): FrameTexture;
}
/** Shared hierarchy painter; isolated temporal captures only gate paint, never native scene context. */
export function renderChildren(
  parentId: string | null,
  width: number,
  height: number,
  background: string,
  entry: LayerTargets,
  key: string,
  frame: RenderFrame,
  window: GroupViewport | null | undefined,
  context: Context,
): FrameTexture {
  const { scale, geometry } = frame;
  const viewport = window?.bounds ?? { x: 0, y: 0, width, height };
  const pixelWidth = window?.pixelWidth ?? rasterExtent(width, scale);
  const pixelHeight = window?.pixelHeight ?? rasterExtent(height, scale);
  let target = context.target(entry, key, "children-a", pixelWidth, pixelHeight);
  context.passes.clear(
    target,
    parentId === null && frame.backgroundId ? "transparent" : background,
    parentId === null && !frame.backgroundId && !frame.capture
      ? frame.page.backgroundGradient
      : undefined,
    parentId === null && window ? { width, height, region: viewport } : undefined,
  );
  const layers = window?.empty ? [] : geometry.children(parentId);
  let batch: { layer: Layer; source: FrameTexture }[] = [],
    primitiveRun: Layer[] = [];
  const flush = () => {
    context.normal.draw(batch, viewport.width, viewport.height, target, viewport);
    batch = [];
  };
  const flushPrimitives = () => {
    if (!primitiveRun.length) return;
    context.cache.ensureCapacity(
      "shared-primitives",
      context.primitives.projectedBytes(primitiveRun.length),
    );
    try {
      context.primitives.draw(
        primitiveRun,
        viewport.width,
        viewport.height,
        scale,
        target,
        viewport,
      );
    } finally {
      context.cache.synchronize("shared-primitives");
    }
    primitiveRun = [];
  };
  for (const original of layers) {
    if (frame.capture && !frame.capture.includes(original.id)) continue;
    const layer = frame.capture?.layer(original) ?? original;
    if (!layer.visible || layer.opacity <= 0 || layer.maskSource || layer.spatialContext) continue;
    if (isInstancedPrimitive(layer) && layer.id !== frame.backgroundId) {
      flush();
      primitiveRun.push(layer);
      continue;
    }
    flushPrimitives();
    const source = context.layer(layer, frame, viewport);
    if (layer.blendMode === "normal") {
      batch.push({ layer, source });
      continue;
    }
    flush();
    const next = context.target(
      entry,
      key,
      target === entry.target("children-a", pixelWidth, pixelHeight) ? "children-b" : "children-a",
      pixelWidth,
      pixelHeight,
    );
    context.passes.blendTo(
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
