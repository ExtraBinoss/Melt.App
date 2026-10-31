import type { Layer, SpatialReflectionQuality } from "@musart/core";
import type { SpatialResource } from "../SpatialResource";
export interface ReflectionSource {
  layer: Layer;
  resource: SpatialResource;
}
export interface ReflectionStats {
  probes: number;
  captures: number;
  resolution: number;
  meshes: number;
  triangles: number;
  receivers: number;
  omittedMeshes: number;
  deferred: boolean;
}
/** A shared capture sees a bounded scene, never one six-face render per object. */
export const REFLECTION_BUDGETS: Record<
  SpatialReflectionQuality,
  { size: number; probes: number; meshes: number; triangles: number; fps: number }
> = {
  draft: { size: 64, probes: 1, meshes: 128, triangles: 100000, fps: 6 },
  balanced: { size: 128, probes: 2, meshes: 256, triangles: 250000, fps: 10 },
  high: { size: 256, probes: 4, meshes: 512, triangles: 500000, fps: 15 },
};
export type ReflectionBudget = (typeof REFLECTION_BUDGETS)[SpatialReflectionQuality];
