import {
  InstancedMesh,
  Matrix4,
  Mesh,
  SkinnedMesh,
  Vector3,
  type Material,
  type Object3D,
} from "three/webgpu";
import type { ReflectionSource, ReflectionBudget } from "./model";
export interface CaptureMesh {
  key: string;
  layerId: string;
  original: Mesh;
  mapping: Matrix4;
  center: Vector3;
  triangles: number;
  opacity: number;
  reflectivity: number;
}
export function reflectiveMaterial(material: Material) {
  const m = material as Material & {
    metalness?: number;
    roughness?: number;
    transmission?: number;
    clearcoat?: number;
  };
  if (m.opacity <= 0 || m.visible === false) return 0;
  if (m.metalness === undefined && m.roughness === undefined) return 0;
  return Math.max(
    m.metalness ?? 0,
    m.transmission ?? 0,
    (m.clearcoat ?? 0) * 0.5,
    (1 - (m.roughness ?? 1)) * 0.3,
  );
}
export function enumerateMeshes(
  source: ReflectionSource,
  mapping: Matrix4,
  opacity: number,
): CaptureMesh[] {
  const items: CaptureMesh[] = [];
  const visible = (node: Object3D) => {
    for (let parent: Object3D | null = node; parent; parent = parent.parent)
      if (!parent.visible) return false;
    return true;
  };
  source.resource.scene.updateMatrixWorld(true);
  source.resource.content.traverse((node) => {
    if (!(node instanceof Mesh) || !visible(node)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const triangles =
      ((node.geometry.index?.count ?? node.geometry.getAttribute("position")?.count ?? 0) / 3) *
      (node instanceof InstancedMesh ? node.count : 1);
    if (!triangles || !materials.some((material) => material.visible && material.opacity > 0))
      return;
    if (node instanceof SkinnedMesh) node.skeleton.update();
    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    const center =
      node.geometry.boundingBox
        ?.getCenter(new Vector3())
        .applyMatrix4(node.matrixWorld)
        .applyMatrix4(mapping) ?? new Vector3();
    items.push({
      key: `${source.layer.id}:${node.uuid}`,
      layerId: source.layer.id,
      original: node,
      mapping,
      center,
      triangles,
      opacity,
      reflectivity: Math.max(...materials.map(reflectiveMaterial)),
    });
  });
  return items;
}
/** Prefer large nearby geometry; rejected meshes consume neither clone buffers nor draw calls. */
export function admitMeshes(items: CaptureMesh[], budget: ReflectionBudget) {
  let triangles = 0;
  const admitted: CaptureMesh[] = [];
  for (const item of items) {
    if (admitted.length >= budget.meshes || triangles + item.triangles > budget.triangles) continue;
    admitted.push(item);
    triangles += item.triangles;
  }
  return { admitted, triangles, omitted: items.length - admitted.length };
}
export function chooseProbes(items: CaptureMesh[], count: number) {
  const candidates = items
    .filter((item) => item.reflectivity > 0.05)
    .sort((a, b) => b.reflectivity - a.reflectivity || b.triangles - a.triangles);
  const chosen: CaptureMesh[] = [];
  for (const item of candidates) {
    if (
      !chosen.length ||
      chosen.every((other) => other.center.distanceToSquared(item.center) > 0.04)
    )
      chosen.push(item);
    if (chosen.length === count) break;
  }
  return chosen;
}
