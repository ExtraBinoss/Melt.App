import { expect, test, vi } from "vitest";
import { createLayer, createSpatialLayer, createSpatialScene } from "@musart/core";
import {
  Bone,
  BoxGeometry,
  Color,
  Float32BufferAttribute,
  Matrix4,
  InstancedMesh,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from "three/webgpu";
import { SpatialResource } from "../../src/spatial/SpatialResource";
import { enumerateMeshes } from "../../src/spatial/reflections/meshes";
import { CaptureScene } from "../../src/spatial/reflections/CaptureScene";
import { ReflectionResource } from "../../src/spatial/reflections/Resource";
import { REFLECTION_BUDGETS } from "../../src/spatial/reflections/model";

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

test("capture instance buffers remain private while geometry and source materials stay borrowed", () => {
  const geometry = new BoxGeometry();
  const material = new MeshStandardMaterial({ metalness: 1, roughness: 0.2 });
  const mesh = new InstancedMesh(geometry, material, 2);
  const matrix = new Matrix4().makeTranslation(0.4, -0.2, 0.3);
  mesh.setMatrixAt(1, matrix);
  mesh.setColorAt(1, new Color("#FF4010"));
  const settings = createSpatialScene();
  const layer = createLayer("rectangle", { spatial: createSpatialLayer("glb") });
  const resource = new SpatialResource(mesh, [], settings);
  const capture = new CaptureScene();
  try {
    const items = enumerateMeshes({ layer, resource }, new Matrix4(), 1);
    expect(items[0]!.triangles).toBe(24);
    const allocation = new ReflectionResource(REFLECTION_BUDGETS.balanced);
    try {
      expect(allocation.projectedBytes(items, []) - allocation.projectedBytes([], [])).toBe(
        1024 + mesh.instanceMatrix.array.byteLength + mesh.instanceColor!.array.byteLength,
      );
      expect(allocation.projectedBytes([], items) - allocation.projectedBytes([], [])).toBe(1024);
    } finally {
      allocation.dispose();
    }
    capture.sync(items, resource.scene, settings, null);
    const proxy = capture.scene.children.find(
      (node) => node instanceof InstancedMesh,
    ) as InstancedMesh;
    expect(proxy.geometry).toBe(mesh.geometry);
    expect(proxy.instanceMatrix).not.toBe(mesh.instanceMatrix);
    expect(proxy.instanceColor).not.toBe(mesh.instanceColor);
    expect([...proxy.instanceMatrix.array]).toEqual([...mesh.instanceMatrix.array]);
    expect([...proxy.instanceColor!.array]).toEqual([...mesh.instanceColor!.array]);
    const disposeMaterial = vi.spyOn(material, "dispose");
    const disposeGeometry = vi.spyOn(geometry, "dispose");
    const disposeInstances = vi.spyOn(mesh, "dispose");
    const disposeProxy = vi.spyOn(proxy, "dispose");
    capture.dispose();
    expect(disposeProxy).toHaveBeenCalledOnce();
    expect(disposeInstances).not.toHaveBeenCalled();
    expect(disposeMaterial).not.toHaveBeenCalled();
    expect(disposeGeometry).not.toHaveBeenCalled();
    expect(Array.from(mesh.instanceMatrix.array.subarray(16))).toEqual([
      ...new Float32Array(matrix.elements),
    ]);
  } finally {
    capture.dispose();
    resource.dispose();
  }
});
