import {
  Mesh,
  InstancedMesh,
  SkinnedMesh,
  type BufferGeometry,
  type Material,
  type Object3D,
  type Skeleton,
  Texture,
} from "three/webgpu";
function resources(roots: readonly Object3D[]) {
  const instances = new Set<InstancedMesh>();
  const geometries = new Set<BufferGeometry>(),
    materials = new Set<Material>(),
    textures = new Set<Texture>(),
    skeletons = new Set<Skeleton>();
  for (const root of roots)
    root.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      geometries.add(node.geometry);
      if (node instanceof InstancedMesh) instances.add(node);
      if (node instanceof SkinnedMesh) skeletons.add(node.skeleton);
      for (const material of Array.isArray(node.material) ? node.material : [node.material])
        materials.add(material);
    });
  for (const material of materials)
    for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
  return { geometries, materials, textures, skeletons, instances };
}
/** glTF scenes may share geometry, materials and image bitmaps. Release each owner exactly once. */
export function disposeModels(roots: readonly Object3D[], retained?: Object3D) {
  const owned = resources(roots),
    keep = resources(retained ? [retained] : []);
  const images = new Set<unknown>([...keep.textures].map((texture) => texture.image));
  for (const material of owned.materials) if (!keep.materials.has(material)) material.dispose();
  for (const texture of owned.textures)
    if (!keep.textures.has(texture)) {
      texture.dispose();
      const image = texture.image as { close?: () => void } | null;
      if (image && !images.has(image)) {
        images.add(image);
        image.close?.();
      }
    }
  for (const instance of owned.instances) if (!keep.instances.has(instance)) instance.dispose();
  for (const skeleton of owned.skeletons) if (!keep.skeletons.has(skeleton)) skeleton.dispose();
  for (const geometry of owned.geometries) if (!keep.geometries.has(geometry)) geometry.dispose();
  for (const root of roots) root.clear();
}
export function disposeModel(root: Object3D) {
  disposeModels([root]);
}
