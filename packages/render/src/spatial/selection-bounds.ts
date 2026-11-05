import {
  createLayerGeometryIndex,
  invertMatrix,
  transformPoint,
  SpatialGeometry,
  type Bounds,
  type Composition,
  type Layer,
} from "@musart/core";
import { Box3, InstancedMesh, Matrix4, Mesh, SkinnedMesh, Vector3 } from "three/webgpu";
import { updateCompositionCamera } from "./camera";
import type { SpatialResource } from "./SpatialResource";

const prepared = new WeakMap<
  SpatialResource,
  {
    page: Composition;
    matrix: readonly number[];
    bounds: Bounds | null;
  }
>();

/** Prepared native ink in the classic layer's local coordinates. Authored text
 * frames remain wrapping constraints; they are not the visible glyph bounds.
 * Mesh boxes keep this bounded independently of extrusion vertex count.
 */
export function spatialSelectionBounds(
  page: Composition,
  layer: Layer,
  resource: SpatialResource,
): Bounds | null {
  if (resource.closed) return null;
  const cached = prepared.get(resource),
    matrix = resource.root.matrixWorld.elements;
  if (cached?.page === page && cached.matrix.every((value, index) => value === matrix[index]))
    return cached.bounds;
  const camera = resource.camera.clone();
  updateCompositionCamera(camera, page, resource.camera.coordinateSystem);
  const inverse = invertMatrix(createLayerGeometryIndex(page).worldMatrix(layer.id));
  // During an imperative transform preview the prepared triangles are retained
  // until the GPU catches up. Evaluate their new portable world pose immediately.
  const pose = new Matrix4().fromArray(new SpatialGeometry(page).worldMatrix(layer.id));
  const retainedInverse = resource.root.matrixWorld.clone().invert();
  const meshMatrix = new Matrix4();
  const point = new Vector3(),
    view = new Vector3(),
    box = new Box3();
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  let clipped = false;
  resource.root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    // Three's object bounds include animated skinning and instancing, when present.
    if (node instanceof SkinnedMesh || node instanceof InstancedMesh) {
      node.computeBoundingBox();
      box.copy(node.boundingBox!);
    } else {
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      box.copy(node.geometry.boundingBox!);
    }
    if (box.isEmpty()) return;
    meshMatrix.multiplyMatrices(pose, retainedInverse).multiply(node.matrixWorld);
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          point.set(x, y, z).applyMatrix4(meshMatrix);
          if (view.copy(point).applyMatrix4(camera.matrixWorldInverse).z >= -camera.near) {
            clipped = true;
            continue;
          }
          point.project(camera);
          const local = transformPoint(inverse, {
            x: ((point.x + 1) * page.width) / 2,
            y: ((1 - point.y) * page.height) / 2,
          });
          left = Math.min(left, local.x);
          top = Math.min(top, local.y);
          right = Math.max(right, local.x);
          bottom = Math.max(bottom, local.y);
        }
  });
  const bounds =
    clipped || !Number.isFinite(left) || right <= left || bottom <= top
      ? null
      : { x: left, y: top, width: right - left, height: bottom - top };
  prepared.set(resource, { page, matrix: [...matrix], bounds });
  return bounds;
}
