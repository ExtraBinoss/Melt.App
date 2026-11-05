import {
  DEFAULT_SPATIAL_SCENE,
  SPATIAL_GEOMETRY_DEFINITIONS,
  SpatialGeometry,
  invertMatrix,
  transformPoint,
  type Bounds,
  type Composition,
  type Layer,
  type SpatialPrimitive,
} from "@musart/core";
import { Box3, Matrix4, Vector3 } from "three/webgpu";
import { createSpatialCamera, updateCompositionCamera } from "../spatial/camera";

/** Conservative primitive transport sizes, matching the native world-AABB crop.
 * Unprepared glyphs, SVG paths and animated imports keep their authored fallback.
 */
export function spatialPreviewExtents(page: Composition, viewport?: Bounds) {
  let geometry: SpatialGeometry | undefined;
  let camera: ReturnType<typeof createSpatialCamera> | undefined;
  return (layer: Layer): { width: number; height: number } => {
    const source = layer.spatial!.source;
    if (!(source in SPATIAL_GEOMETRY_DEFINITIONS)) return layer;
    geometry ??= new SpatialGeometry(page);
    if (!camera) {
      const settings = page.spatial ?? DEFAULT_SPATIAL_SCENE;
      camera = createSpatialCamera(settings.camera, page.width / page.height);
      updateCompositionCamera(camera, page, camera.coordinateSystem);
    }
    const { halfSize } =
      SPATIAL_GEOMETRY_DEFINITIONS[source as Exclude<SpatialPrimitive, "shape">].bounds;
    const box = new Box3(
      new Vector3(-halfSize[0], -halfSize[1], -halfSize[2]),
      new Vector3(halfSize[0], halfSize[1], halfSize[2]),
    ).applyMatrix4(new Matrix4().fromArray(geometry.worldMatrix(layer.id)));
    const inverse = invertMatrix(geometry.layoutMatrix(layer.id));
    const region = viewport ?? { x: 0, y: 0, width: page.width, height: page.height };
    const gate = [
      { x: region.x, y: region.y },
      { x: region.x + region.width, y: region.y },
      { x: region.x, y: region.y + region.height },
      { x: region.x + region.width, y: region.y + region.height },
    ].map((point) => transformPoint(inverse, point));
    const left = Math.min(...gate.map((point) => point.x)) - 2;
    const top = Math.min(...gate.map((point) => point.y)) - 2;
    const right = Math.max(...gate.map((point) => point.x)) + 2;
    const bottom = Math.max(...gate.map((point) => point.y)) + 2;
    const points: { x: number; y: number }[] = [];
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const point = new Vector3(x, y, z);
          if (point.clone().applyMatrix4(camera.matrixWorldInverse).z >= -0.01)
            return { width: right - left, height: bottom - top };
          point.project(camera);
          points.push(
            transformPoint(inverse, {
              x: ((point.x + 1) * page.width) / 2,
              y: ((1 - point.y) * page.height) / 2,
            }),
          );
        }
    return {
      width: Math.max(
        1,
        Math.min(right, Math.ceil(Math.max(...points.map((p) => p.x))) + 2) -
          Math.max(left, Math.floor(Math.min(...points.map((p) => p.x))) - 2),
      ),
      height: Math.max(
        1,
        Math.min(bottom, Math.ceil(Math.max(...points.map((p) => p.y))) + 2) -
          Math.max(top, Math.floor(Math.min(...points.map((p) => p.y))) - 2),
      ),
    };
  };
}
