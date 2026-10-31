import {
  Matrix4,
  type Material,
  type Mesh,
  type MeshStandardNodeMaterial,
  type Texture,
  type WebGPURenderer,
  type Node,
  type NodeBuilder,
} from "three/webgpu";
import { Fn, pmremTexture, reflectVector, roughness, uniform, vec3 } from "three/tsl";
import type { CaptureMesh } from "./meshes";
import { copySpatialMaterial } from "../material-copy";
function makeBinding(renderer: WebGPURenderer, base: Material, texture: Texture) {
  const converted = renderer.library.fromMaterial(base);
  if (!converted) throw Error("Unsupported reflection material");
  const material = converted.clone() as MeshStandardNodeMaterial;
  if (converted !== base) converted.dispose();
  const mapping = uniform(new Matrix4());
  const envNode = Fn((_inputs: unknown, builder: NodeBuilder) => {
    const context = builder.context as {
      getUV?: () => Node<"vec3">;
      getTextureLevel?: () => Node<"float">;
    };
    return pmremTexture(
      texture,
      vec3(context.getUV?.() ?? reflectVector).transformDirection(mapping),
      context.getTextureLevel?.() ?? roughness,
    );
  })();
  return { material, mapping, envNode, texture, base, version: -1 };
}
export class ReflectionBindings {
  private readonly copies = new Map<string, ReturnType<typeof makeBinding>>();
  private readonly assigned = new Map<Mesh, Mesh["material"]>();
  private readonly stamps = new Map<string, string>();
  bind(
    renderer: WebGPURenderer,
    items: CaptureMesh[],
    probes: { center: import("three").Vector3; texture: Texture }[],
    revision: number,
  ) {
    const active = new Set<string>();
    this.restore();
    const layerProbes = new Map<string, Set<number>>();
    for (const item of items) {
      if (item.reflectivity <= 0.05 || !probes.length) continue;
      const probe = probes.reduce((a, b) =>
        a.center.distanceToSquared(item.center) <= b.center.distanceToSquared(item.center) ? a : b,
      );
      const bases = Array.isArray(item.original.material)
        ? item.original.material
        : [item.original.material];
      this.assigned.set(item.original, item.original.material);
      const copies = bases.map((base) => {
        const key = `${item.layerId}:${base.uuid}:${probe.texture.uuid}`;
        active.add(key);
        let copy = this.copies.get(key);
        if (!copy) {
          copy = makeBinding(renderer, base, probe.texture);
          this.copies.set(key, copy);
        }
        const version = base.version;
        copy.material.envMap = null;
        copy.material.envNode = null;
        copySpatialMaterial(copy.material, base);
        copy.mapping.value.copy(item.mapping);
        copy.material.envMap = probe.texture;
        copy.material.envMapIntensity = 1;
        copy.material.envMapRotation.set(0, 0, 0);
        copy.material.envNode = copy.envNode;
        if (copy.version !== version) {
          copy.material.needsUpdate = true;
          copy.version = version;
        }
        return copy.material;
      });
      item.original.material = Array.isArray(item.original.material) ? copies : copies[0]!;
      const textures = layerProbes.get(item.layerId) ?? new Set<number>();
      textures.add(probe.texture.id);
      layerProbes.set(item.layerId, textures);
    }
    for (const [layerId, textures] of layerProbes)
      this.stamps.set(layerId, `${revision}:${[...textures].join(",")}`);
    for (const [key, copy] of this.copies)
      if (!active.has(key)) {
        copy.material.dispose();
        this.copies.delete(key);
      }
  }
  stamp(layerId: string) {
    return this.stamps.get(layerId) ?? null;
  }
  get bytes() {
    return this.copies.size * 1024;
  }
  get count() {
    return this.assigned.size;
  }
  restore() {
    const owned = new Set([...this.copies.values()].map((copy) => copy.material));
    for (const [mesh, original] of this.assigned) {
      const current = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (current.some((material) => owned.has(material as MeshStandardNodeMaterial)))
        mesh.material = original;
    }
    this.assigned.clear();
    this.stamps.clear();
  }
  dispose() {
    this.restore();
    for (const copy of this.copies.values()) copy.material.dispose();
    this.copies.clear();
  }
}
