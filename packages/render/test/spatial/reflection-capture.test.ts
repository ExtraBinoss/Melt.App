import { expect, test } from "vitest";
import { createLayer, createSpatialLayer, createSpatialScene } from "@musart/core";
import {
  Bone,
  BoxGeometry,
  Float32BufferAttribute,
  Matrix4,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from "three/webgpu";
import { SpatialResource } from "../../src/spatial/SpatialResource";
import { enumerateMeshes } from "../../src/spatial/reflections/meshes";
import { CaptureScene } from "../../src/spatial/reflections/CaptureScene";

test("reflection proxies preserve animated skinning and borrow the original skeleton without changing its bind pose", () => {
  const geometry = new BoxGeometry();
  const count = geometry.getAttribute("position").count;
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
  const material = new MeshStandardMaterial({ metalness: 1, roughness: 0.2 });
  const mesh = new SkinnedMesh(geometry, material);
  const bone = new Bone();
  mesh.add(bone);
  mesh.position.set(0.2, 0.3, 0);
  mesh.updateMatrixWorld(true);
  mesh.bind(new Skeleton([bone]));
  const bind = mesh.bindMatrix.clone();
  const settings = createSpatialScene();
  const layer = createLayer("rectangle", { spatial: createSpatialLayer("glb") });
  const resource = new SpatialResource(mesh, [], settings);
  const capture = new CaptureScene();
  try {
    resource.root.position.set(1, -2, 0.5);
    resource.root.rotation.y = 0.6;
    resource.root.scale.set(1.2, 0.8, 1.1);
    bone.rotation.z = 0.4;
    const items = enumerateMeshes({ layer, resource }, new Matrix4(), 1);
    capture.sync(items, resource.scene, settings, null);
    const proxy = capture.scene.children.find((node) => node instanceof SkinnedMesh) as SkinnedMesh;
    expect(proxy.skeleton).toBe(mesh.skeleton);
    for (let i = 0; i < count; i++) {
      const expected = mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld);
      const actual = proxy.getVertexPosition(i, new Vector3()).applyMatrix4(proxy.matrixWorld);
      expect(actual.distanceTo(expected)).toBeLessThan(1e-6);
    }
    expect(mesh.bindMatrix.elements).toEqual(bind.elements);
    expect(mesh.material).toBe(material);
    capture.dispose();
    expect(mesh.skeleton.bones).toEqual([bone]);
    expect(mesh.getVertexPosition(0, new Vector3()).length()).toBeGreaterThan(0);
  } finally {
    capture.dispose();
    resource.dispose();
  }
});
