import type { Layer } from "@musart/core";
import type { RenderTarget } from "three/webgpu";
import type { LayerTargets } from "./targets";
import type { TextureSources } from "../surface/TextureSources";
import type { TextSources } from "../surface/text/source";
import type { VectorSources } from "../surface/vector/source";
import type { SpatialSources } from "../spatial/SpatialSources";
import type { GpuPasses } from "./passes";
import type { FrameTexture } from "./types";
interface SourceContext {
  width: number;
  height: number;
  scale: number;
  vectorAntialias: boolean;
  displayP3: boolean;
  entry: LayerTargets;
  sources: TextureSources;
  texts: TextSources;
  vectors: VectorSources;
  spatial: SpatialSources | null;
  passes: GpuPasses;
  target(role: string, samples?: number, width?: number, height?: number): RenderTarget;
  children(): FrameTexture;
}
/** Groups already contain working-space children; native/media surfaces arrive encoded as sRGB. */
export function isSrgbLayerSource(layer: Layer) {
  return (
    layer.kind === "image" ||
    layer.kind === "video" ||
    (layer.kind !== "group" && !!layer.spatial?.enabled)
  );
}
/** Source owners prepare independently; ordinary composition/effects never know their geometry. */
export function drawLayerSource(layer: Layer, context: SourceContext): FrameTexture {
  const { width, height, scale, entry } = context;
  if (layer.kind === "group") return context.children();
  if (layer.spatial?.enabled) {
    const bounds = context.spatial!.bounds(layer.id);
    const w = Math.max(1, Math.ceil((bounds?.width ?? layer.width) * scale)),
      h = Math.max(1, Math.ceil((bounds?.height ?? layer.height) * scale));
    const target = context.target("spatial", 0, w, h);
    context.spatial!.render(layer, target);
    return { texture: target.texture, width: w, height: h, premultiplied: true, bounds };
  }
  if (layer.kind === "image" || layer.kind === "video")
    return {
      texture: context.sources.image(layer.assetId, layer.kind === "video" ? layer.id : undefined),
      width,
      height,
      premultiplied: false,
    };
  if (layer.kind === "text") {
    const target = context.target("text");
    context.passes.clear(target);
    context.texts.render(layer, target);
    return { texture: target.texture, width, height, premultiplied: true };
  }
  if (layer.kind === "vector") {
    const target = context.target("vector", context.vectorAntialias ? 4 : 0);
    context.passes.clear(target);
    context.vectors.render(layer, target, context.displayP3);
    return { texture: target.texture, width, height, premultiplied: true };
  }
  const target = context.target("shape");
  const paint = JSON.stringify([
    layer.kind,
    layer.width,
    layer.height,
    layer.fill,
    layer.stroke,
    layer.strokeWidth,
    layer.radius,
    scale,
  ]);
  if (entry.sourceSignature !== paint) {
    context.passes.shapeTo(layer, scale, target);
    entry.sourceSignature = paint;
  }
  return { texture: target.texture, width, height, premultiplied: false };
}
