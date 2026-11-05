import { expect, test, vi } from "vitest";
import {
  BoxGeometry,
  Matrix4,
  Mesh,
  MeshStandardNodeMaterial,
  Texture,
  Vector3,
  type WebGPURenderer,
} from "three/webgpu";
import { ReflectionBindings } from "../../src/spatial/reflections/bindings";
import type { CaptureMesh } from "../../src/spatial/reflections/meshes";
import * as materials from "../../src/spatial/material-copy";

test("reflection receivers retain material copies across camera samples and refresh unversioned appearance", () => {
  const base = new MeshStandardNodeMaterial(),
    geometry = new BoxGeometry();
  const mesh = new Mesh(geometry, base),
    texture = new Texture(),
    bindings = new ReflectionBindings();
  const renderer = {
    library: { fromMaterial: (value: MeshStandardNodeMaterial) => value },
  } as unknown as WebGPURenderer;
  const item: CaptureMesh = {
    key: "a",
    layerId: "a",
    original: mesh,
    mapping: new Matrix4(),
    center: new Vector3(),
    triangles: 12,
    opacity: 1,
    reflectivity: 1,
  };
  const probes = [{ center: new Vector3(), texture }];
  const copy = vi.spyOn(materials, "copySpatialMaterial");
  try {
    bindings.bind(renderer, [item], probes, 1, "same");
    const first = mesh.material;
    for (let i = 0; i < 30; i++) bindings.bind(renderer, [item], probes, 1, "same");
    expect(copy).toHaveBeenCalledOnce();
    expect(mesh.material).toBe(first);
    bindings.restore();
    expect(mesh.material).toBe(base);
    const version = base.version;
    base.color.set("#ff0000");
    expect(base.version).toBe(version);
    bindings.bind(renderer, [item], probes, 1, "changed");
    expect(first.color.getHex()).toBe(0xff0000);
    expect(copy).toHaveBeenCalledTimes(2);
    bindings.dispose();
    expect(mesh.material).toBe(base);
    expect(bindings.count).toBe(0);
  } finally {
    copy.mockRestore();
    bindings.dispose();
    texture.dispose();
    geometry.dispose();
    base.dispose();
  }
});
