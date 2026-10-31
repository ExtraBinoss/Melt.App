import {
  createLayerGeometryIndex,
  DEFAULT_SPATIAL_SCENE,
  type Composition,
  type Point,
} from "@musart/core";
import { Mesh, Raycaster, Vector2, type CoordinateSystem } from "three/webgpu";
import { createSpatialCamera, updateCompositionCamera } from "./camera";
import type { SpatialResource } from "./SpatialResource";

/** Native triangle picking shares the prepared scene's world transforms. No pixel reads. */
export function pickSpatialLayer(
  page: Composition,
  point: Point,
  source: (id: string) => SpatialResource | null,
  coordinateSystem: CoordinateSystem,
  includeLocked = false,
): string | null | undefined {
  const index = createLayerGeometryIndex(page);
  const layers = page.layers.filter(
    (l) =>
      l.spatial?.enabled &&
      l.spatial.source !== "group" &&
      !index.isMaskSource(l.id) &&
      !l.spatialContext &&
      index.isVisible(l.id) &&
      (includeLocked || !index.isLocked(l.id)),
  );
  if (!layers.length) return undefined;
  const camera = createSpatialCamera(
    (page.spatial ?? DEFAULT_SPATIAL_SCENE).camera,
    page.width / page.height,
  );
  updateCompositionCamera(camera, page, coordinateSystem);
  const ray = new Raycaster();
  ray.setFromCamera(
    new Vector2((point.x / page.width) * 2 - 1, 1 - (point.y / page.height) * 2),
    camera,
  );
  let closest = Infinity,
    picked: string | null = null;
  for (const layer of layers) {
    const resource = source(layer.id);
    if (!resource || resource.closed) return undefined;
    for (const hit of ray.intersectObject(resource.root, true)) {
      let visible = true;
      for (let node: import("three").Object3D | null = hit.object; node; node = node.parent)
        if (!node.visible) visible = false;
      if (!visible) continue;
      if (hit.distance >= closest || !(hit.object instanceof Mesh)) continue;
      const materials = Array.isArray(hit.object.material)
        ? hit.object.material
        : [hit.object.material];
      const material = materials[hit.face?.materialIndex ?? 0];
      if (!material?.visible || material.opacity <= 0) continue;
      closest = hit.distance;
      picked = layer.id;
      break;
    }
  }
  return picked;
}
