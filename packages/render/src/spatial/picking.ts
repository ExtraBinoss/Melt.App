import {
  createLayerGeometryIndex,
  DEFAULT_SPATIAL_SCENE,
  type Composition,
  type Point,
  type LayerGeometryIndex,
} from "@musart/core";
import { Mesh, Raycaster, Vector2, type CoordinateSystem, type Object3D } from "three/webgpu";
import { createSpatialCamera, updateCompositionCamera } from "./camera";
import type { SpatialResource } from "./SpatialResource";

/** Native triangle picking shares the prepared scene's world transforms. No pixel reads. */
export function pickSpatialLayer(
  page: Composition,
  point: Point,
  source: (id: string) => SpatialResource | null,
  coordinateSystem: CoordinateSystem,
  includeLocked = false,
  index: LayerGeometryIndex = createLayerGeometryIndex(page),
): string | null | undefined {
  const layers = index.spatialLayers.filter(
    (l) =>
      l.spatial?.enabled &&
      l.spatial.source !== "group" &&
      !index.isMaskSource(l.id) &&
      !l.spatialContext &&
      index.isVisible(l.id) &&
      (includeLocked || !index.isLocked(l.id)),
  );
  if (!layers.length) return undefined;
  // A handful of native objects is cheaper to raycast directly than preparing
  // bounds for a large mixed 2D/3D composition.
  const candidates =
    layers.length > 8
      ? new Set(
          index
            .queryBounds({ x: point.x, y: point.y, width: 0, height: 0 }, false)
            .map((layer) => layer.id),
        )
      : null;
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
    if (candidates) {
      // Full-artboard projection denotes a near-plane ambiguity. Animated imported
      // resources can move beyond their static normalized source bounds too.
      const bounds = index.worldBounds(layer.id);
      const uncertain =
        resource.clips.length > 0 ||
        (bounds.x === 0 &&
          bounds.y === 0 &&
          bounds.width === page.width &&
          bounds.height === page.height);
      if (!candidates.has(layer.id) && !uncertain) continue;
    }
    for (const hit of ray.intersectObject(resource.root, true)) {
      let visible = true;
      for (let node: Object3D | null = hit.object; node; node = node.parent)
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
