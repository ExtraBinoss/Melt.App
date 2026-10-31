import { expect, test, vi } from "vitest";
import {
  Bone,
  BoxGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardNodeMaterial,
  Scene,
  Skeleton,
  SkinnedMesh,
  Texture,
  WebGPUCoordinateSystem,
  type WebGPURenderer,
} from "three/webgpu";
import { uniform } from "three/tsl";
import { DepthBindings } from "../../src/spatial/scene/DepthBindings";
import * as copies from "../../src/spatial/material-copy";

function fixture(count: number) {
  const renderer = {
    coordinateSystem: WebGPUCoordinateSystem,
    library: { fromMaterial: (base: MeshStandardNodeMaterial) => base },
  } as unknown as WebGPURenderer;
  const geometry = new BoxGeometry(),
    texture = new Texture();
  const materials = Array.from({ length: count }, () => new MeshStandardNodeMaterial());
  const meshes: Mesh[] = materials.map((material) => new Mesh(geometry, material));
  const bindings = new DepthBindings(renderer, texture);
  return {
    geometry,
    materials,
    meshes,
    bindings,
    dispose() {
      bindings.dispose();
      geometry.dispose();
      texture.dispose();
      for (const material of materials) material.dispose();
    },
  };
}

test.each([1, 8, 32, 64])(
  "%i single-mesh source passes perform linear real material synchronization",
  (count) => {
    const f = fixture(count),
      copy = vi.spyOn(copies, "copySpatialMaterial");
    try {
      f.bindings.sync(f.meshes);
      expect(copy).toHaveBeenCalledTimes(count * 3);
      f.bindings.bind(f.meshes, "depth");
      f.bindings.restore();
      for (const mesh of f.meshes) {
        f.bindings.bind([mesh], "color");
        expect(
          f.meshes
            .filter((other) => other !== mesh)
            .every((other) => other.material === f.materials[f.meshes.indexOf(other)]),
        ).toBe(true);
        f.bindings.restore();
      }
      expect(copy).toHaveBeenCalledTimes(count * 3);
      expect(f.bindings.stats()).toEqual({
        synchronizations: count * 3,
        assignments: count * 2,
        meshes: count,
      });
      f.bindings.sync(f.meshes);
      expect(copy).toHaveBeenCalledTimes(count * 6);
    } finally {
      copy.mockRestore();
      f.dispose();
    }
  },
);

test("shared multi-material bindings copy once per variant, refresh unversioned values and restore on switching sources", () => {
  const f = fixture(2),
    [a, b] = f.materials;
  const originals = [a!, b!, a!];
  f.meshes[0]!.material = originals;
  f.meshes[1]!.material = a!;
  const version = a!.version;
  try {
    a!.color.set("#ff0000");
    a!.roughness = 0.75;
    a!.opacity = 0.5;
    const opacity = uniform(0.3);
    a!.opacityNode = opacity;
    expect(a!.version).toBe(version);
    f.bindings.sync(f.meshes);
    expect(f.bindings.stats().synchronizations).toBe(6);
    f.bindings.bind([f.meshes[0]!], "color");
    const material = (f.meshes[0]!.material as MeshStandardNodeMaterial[])[0]!;
    expect(material.color.getHex()).toBe(0xff0000);
    expect(material.roughness).toBe(0.75);
    expect(material.opacity).toBe(0.5);
    expect(material.opacityNode).toBe(a!.opacityNode);
    expect((f.meshes[0]!.material as MeshStandardNodeMaterial[])[2]).toBe(material);
    f.bindings.bind([f.meshes[1]!], "depth");
    expect(f.meshes[0]!.material).toBe(originals);
    expect((f.meshes[1]!.material as MeshStandardNodeMaterial).depthWrite).toBe(false);
    f.bindings.restore();
    a!.color.set("#00ff00");
    a!.roughness = 0.2;
    a!.opacity = 1;
    opacity.value = 1;
    f.bindings.sync(f.meshes);
    f.bindings.bind([f.meshes[0]!], "color");
    expect(material.color.getHex()).toBe(0x00ff00);
    expect(material.roughness).toBe(0.2);
    expect(material.opacity).toBe(1);
    expect(f.meshes[1]!.material).toBe(a);
    f.bindings.restore();
    expect(f.meshes[0]!.material).toBe(originals);
  } finally {
    f.dispose();
  }
});

test("binding preserves skinned/morphed mesh ownership, masks, and disposes removed private materials", () => {
  const f = fixture(1),
    base = f.materials[0]!;
  const position = f.geometry.getAttribute("position");
  f.geometry.morphAttributes.position = [new Float32BufferAttribute(Array.from(position.array), 3)];
  const mesh = new SkinnedMesh(f.geometry, base),
    bone = new Bone();
  mesh.add(bone);
  mesh.bind(new Skeleton([bone]));
  mesh.updateMorphTargets();
  mesh.morphTargetInfluences![0] = 0.6;
  base.maskNode = uniform(true);
  const originalMask = base.maskNode,
    skeleton = mesh.skeleton;
  try {
    f.bindings.sync([mesh]);
    f.bindings.bind([mesh], "color");
    const color = mesh.material;
    const colorDisposed = vi.spyOn(color, "dispose"),
      baseDisposed = vi.spyOn(base, "dispose");
    expect(color).not.toBe(base);
    expect(color.maskNode).not.toBe(originalMask);
    expect(mesh.skeleton).toBe(skeleton);
    expect(mesh.morphTargetInfluences).toEqual([0.6]);
    f.bindings.sync([]);
    expect(mesh.material).toBe(base);
    expect(base.maskNode).toBe(originalMask);
    expect(colorDisposed).toHaveBeenCalledOnce();
    expect(baseDisposed).not.toHaveBeenCalled();
    expect(f.bindings.bytes).toBe(0);
    const scene = new Scene();
    scene.add(mesh);
    f.bindings.apply(scene, "depth", () => false);
    expect(mesh.material.depthWrite).toBe(false);
    f.bindings.dispose();
    expect(mesh.material).toBe(base);
  } finally {
    mesh.skeleton.dispose();
    f.dispose();
  }
});
