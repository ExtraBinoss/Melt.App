import { BoundsIndex, type SpatialEntry } from "@musart/spatial-index";
import type { Composition, Layer } from "../document/model";
import { morphContentBounds } from "../effects/morph/bounds";
import { transformPoint, type Bounds } from "./geometry";
import type { LayerGeometryIndex } from "./geometry-index";

/** Source ink is authoritative for marquee; resize frames keep worldBounds semantics. */
export function contentWorldBounds(index: LayerGeometryIndex, layer: Layer): Readonly<Bounds> {
  const ink = morphContentBounds(layer);
  if (!ink) return index.worldBounds(layer.id);
  const matrix = index.worldMatrix(layer.id);
  const corners = [
    { x: ink.x, y: ink.y },
    { x: ink.x + ink.width, y: ink.y },
    { x: ink.x + ink.width, y: ink.y + ink.height },
    { x: ink.x, y: ink.y + ink.height },
  ].map((point) => transformPoint(matrix, point));
  const x = Math.min(...corners.map((point) => point.x));
  const y = Math.min(...corners.map((point) => point.y));
  return {
    x,
    y,
    width: Math.max(...corners.map((p) => p.x)) - x,
    height: Math.max(...corners.map((p) => p.y)) - y,
  };
}

function broadBounds(index: LayerGeometryIndex, layer: Layer): SpatialEntry {
  // Preserve the allocation-free root fast path used by existing pointer picking.
  const b =
    !layer.spatial?.enabled &&
    layer.parentId === null &&
    !layer.affine &&
    layer.rotation === 0 &&
    (layer.scaleX ?? 1) === 1 &&
    (layer.scaleY ?? 1) === 1
      ? layer
      : index.worldBounds(layer.id);
  const ink = morphContentBounds(layer);
  if (!ink) return { id: layer.id, x: b.x, y: b.y, width: b.width, height: b.height };
  const c = contentWorldBounds(index, layer);
  const x = Math.min(b.x, c.x),
    y = Math.min(b.y, c.y);
  return {
    id: layer.id,
    x,
    y,
    width: Math.max(b.x + b.width, c.x + c.width) - x,
    height: Math.max(b.y + b.height, c.y + c.height) - y,
  };
}

/** Packed bounds are independent of selection state, visibility, locks and paint ordering. */
export class GeometryQuery {
  readonly bounds: BoundsIndex;
  private readonly layers: ReadonlyMap<string, Layer>;
  private readonly spatialPage: Composition["spatial"];
  private readonly width: number;
  private readonly height: number;
  constructor(page: Composition, geometry: LayerGeometryIndex, previous?: GeometryQuery) {
    this.layers = geometry.byId;
    this.spatialPage = page.spatial;
    this.width = page.width;
    this.height = page.height;
    if (!previous) {
      this.bounds = new BoundsIndex(page.layers.map((layer) => broadBounds(geometry, layer)));
      return;
    }
    const dirty = new Set<string>(),
      removed: string[] = [];
    for (const layer of page.layers)
      if (previous.layers.get(layer.id) !== layer) dirty.add(layer.id);
    for (const id of previous.layers.keys()) if (!geometry.byId.has(id)) removed.push(id);
    // Projected group bounds depend on descendants, camera and viewport. Re-evaluate those
    // snapshots in full; native spatial source geometry is not represented by 2D matrices.
    const spatial = geometry.spatialLayers.length > 0;
    if (
      spatial &&
      (dirty.size ||
        removed.length ||
        this.spatialPage !== previous.spatialPage ||
        this.width !== previous.width ||
        this.height !== previous.height)
    ) {
      this.bounds = new BoundsIndex(page.layers.map((layer) => broadBounds(geometry, layer)));
      return;
    }
    const pending = [...dirty];
    while (pending.length)
      for (const child of geometry.children(pending.pop()!)) {
        if (dirty.has(child.id)) continue;
        dirty.add(child.id);
        pending.push(child.id);
      }
    this.bounds = previous.bounds.fork(
      [...dirty].map((id) => broadBounds(geometry, geometry.get(id))),
      removed,
    );
  }
  search(bounds: Bounds, geometry: LayerGeometryIndex, ordered: boolean): Layer[] {
    // The exact parent-local inverse and the forward AABB can round in opposite
    // directions at an edge. This only admits extra candidates; it never grants a hit.
    const epsilon =
      Number.EPSILON *
      64 *
      Math.max(
        1,
        Math.abs(bounds.x),
        Math.abs(bounds.y),
        Math.abs(bounds.x + bounds.width),
        Math.abs(bounds.y + bounds.height),
      );
    const ids = this.bounds.search({
      x: bounds.x - epsilon,
      y: bounds.y - epsilon,
      width: bounds.width + epsilon * 2,
      height: bounds.height + epsilon * 2,
    });
    return ordered ? geometry.orderedLayers(ids) : ids.map((id) => geometry.get(id));
  }
}
