import type { TextSourceStats } from "../surface/text/diagnostics";
import type { VideoProxyActivity } from "../sources/video/proxy/model";
import type { MediaVideoSources } from "../sources/media/video-sources";
import type { ReflectionStats } from "../spatial/reflections/model";
import type { Texture } from "three/webgpu";
import type { Bounds, Composition, MotionFramePlan } from "@musart/core";
import type { MediaSourceResolver } from "../sources/media/model";
import type { FontResolver } from "../surface/text/fonts";
export interface BackgroundGpuActivity {
  read(): boolean;
  subscribe(listener: () => void): () => void;
  ready?(): void;
}
export interface RenderOptions {
  /** Admission for optional GPU work; preview interactions can defer captures without React. */
  backgroundGpu?: BackgroundGpuActivity;
  scale?: number;
  /** Display applies the document ICC proof. Source is reserved for native CMYK encoding. */
  colorOutput?: "display" | "source";
  /** SVG source coverage at the delivered density; fixed effect/mask references keep authored pixels. */
  vectorAntialias?: boolean;
  forceWebGL?: boolean;
  /** Stable canonical hint when a materialized Motion pose hides future video tracks. */
  videoSources?: boolean;
  canRender?: () => boolean;
  fontResolver?: FontResolver;
  mediaResolver?: MediaSourceResolver;
  motionFrame?: MotionFramePlan;
  /** Dedicated export jobs always request exact samples from original files. */
  mediaMode?: "preview" | "playback" | "exact";
  /** Reuse a bounded forward decoder cursor while preserving exact original/frame selection. */
  mediaSequential?: boolean;
  signal?: AbortSignal;
  /** Explicit diagnostics opt-in. Runtime marker/sample buffers stay disabled by default. */
  profileVideo?: boolean;
  /** Optional User Timing lineage; no sample arrays or GPU pixel reads. Disabled by default. */
  traceFrames?: boolean;
  /** Interactive canvas only. Exports omit this activity-owned proxy preparation gate. */
  videoProxy?: VideoProxyActivity;
}
export interface FrameTexture {
  texture: Texture;
  width: number;
  height: number;
  premultiplied: boolean;
  /** A transport texture may cover only this rectangle of its owner's authored coordinates. */
  bounds?: Bounds;
}
export interface GpuStats {
  submission?: { pending: number; peak: number; limit: number };
  text?: TextSourceStats | null;
  /** Opt-in CPU wall time, including native/queue waits; never a GPU-duration measurement. */
  profile?: Record<"pipeline" | "sources" | "text" | "compose", readonly number[]> | null;
  passes: number;
  readbacks: number;
  video?: ReturnType<MediaVideoSources["stats"]> | null;
  spatial?: {
    sources: number;
    meshes: number;
    vertices: number;
    triangles: number;
    reflections?: ReflectionStats;
  } | null;
  uploads: number;
  targets: number;
  cacheBytes: number;
  cacheEntries?: number;
  frames: number;
  cacheHits: number;
  vectorParses: number;
  maxBytes: number;
  primitiveDraws?: number;
  primitiveInstances?: number;
  primitiveBytes?: number;
}
/** Ceil true fractional coverage without adding a texel for multiplication roundoff. */
export function rasterExtent(extent: number, scale: number): number {
  const value = extent * scale;
  if (!Number.isFinite(value) || extent <= 0 || scale <= 0)
    throw new RangeError("Invalid raster extent.");
  return Math.max(1, Math.ceil(value - Math.max(1, Math.abs(value)) * Number.EPSILON * 4));
}
export function assertRenderSize(page: Composition, scale: number): void {
  if (!Number.isFinite(scale) || scale <= 0 || scale > 8)
    throw new Error("Échelle d’export invalide (0–8×).");
  if (
    page.width * scale > 16384 ||
    page.height * scale > 16384 ||
    page.width * page.height * scale * scale > 64_000_000
  )
    throw new Error("Export trop grand : limite de 16 384 px par côté et 64 mégapixels.");
}
