import { Box3, Matrix4, Vector3 } from "three/webgpu";
import {
  createLayerGeometryIndex,
  SpatialGeometry,
  spatialSourceBounds,
  type Composition,
  type SnapBounds3,
  type SnapVector,
} from "@musart/core";
import { canvasSpatialSource } from "../../render/plane-resources";

/** Capture prepared CPU mesh bounds once. No pixel reads and no geometry preparation on input. */
export function spatialSnapBounds(page: Composition, movingId: string, canvas: HTMLCanvasElement) {
  const index = createLayerGeometryIndex(page),
    geometry = new SpatialGeometry(page, index.byId);
  const moving = new Box3(),
    references: SnapBounds3[] = [];
  const groups = new Map<string, Box3>();
  const own = new Set([movingId, ...index.ancestors(movingId).map((l) => l.id)]);
  for (const layer of page.layers) {
    if (
      !layer.spatial?.enabled ||
      layer.spatial.source === "group" ||
      !index.isVisible(layer.id) ||
      index.isMaskSource(layer.id) ||
      [layer, ...index.ancestors(layer.id)].some((item) => item.opacity <= 0)
    )
      continue;
    const resource = canvasSpatialSource(canvas, layer.id);
    let bounds: Box3;
    if (resource && !resource.closed) bounds = new Box3().setFromObject(resource.root);
    else {
      const shape = spatialSourceBounds(layer),
        c = new Vector3(...shape.center),
        half = new Vector3(...shape.halfSize);
      bounds = new Box3(c.clone().sub(half), c.clone().add(half)).applyMatrix4(
        new Matrix4().fromArray(geometry.worldMatrix(layer.id)),
      );
    }
    if (bounds.isEmpty()) continue;
    for (const parent of index.ancestors(layer.id)) {
      if (!parent.spatial?.enabled) continue;
      const group = groups.get(parent.id) ?? new Box3();
      group.union(bounds);
      groups.set(parent.id, group);
    }
    if (layer.id === movingId || index.ancestors(layer.id).some((p) => p.id === movingId))
      moving.union(bounds);
    else if (!own.has(layer.id))
      references.push({
        id: layer.id,
        min: bounds.min.toArray() as SnapVector,
        max: bounds.max.toArray() as SnapVector,
      });
  }
  for (const [id, bounds] of groups) {
    if (own.has(id) || index.ancestors(id).some((parent) => parent.id === movingId)) continue;
    references.push({
      id,
      min: bounds.min.toArray() as SnapVector,
      max: bounds.max.toArray() as SnapVector,
    });
  }
  if (moving.isEmpty()) return null;
  return {
    moving: {
      id: movingId,
      min: moving.min.toArray() as SnapVector,
      max: moving.max.toArray() as SnapVector,
    },
    references,
  };
}
