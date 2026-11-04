import type { PlaneResources } from "./plane-resources";

export const canvasOwners = new WeakMap<HTMLCanvasElement, PlaneResources>();
/** A diagnostic request uses the existing display renderer; it never allocates a second engine. */
export function canvasProfileSource(canvas: HTMLCanvasElement) {
  const owner = canvasOwners.get(canvas);
  return owner
    ? {
        source: owner.profile,
        force: () => owner.refreshFrame(),
      }
    : null;
}
/** Borrowed, canvas-scoped native 3D resources. The display plane retains ownership. */
export function canvasSpatialSource(canvas: HTMLCanvasElement, layerId: string) {
  return canvasOwners.get(canvas)?.spatialSource(layerId) ?? null;
}
export function canvasNativeRenderer(canvas: HTMLCanvasElement) {
  return canvasOwners.get(canvas)?.borrowRenderer() ?? null;
}
