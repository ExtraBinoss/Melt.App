import {
  Matrix4,
  Mesh,
  type Material,
  type NodeMaterial,
  type Node,
  type Scene,
  type Texture,
  type WebGPURenderer,
  WebGPUCoordinateSystem,
} from "three/webgpu";
import { bool, float, fwidth, positionWorld, texture, uniform, vec2, vec4 } from "three/tsl";
import { copySpatialMaterial } from "../material-copy";

/** GPU depth is sampled directly; no CPU readback or alternate shader pipeline. */
export class DepthBindings {
  readonly viewProjection = uniform(new Matrix4());
  readonly occlusion = uniform(1);
  private readonly copies = new Map<
    string,
    { base: Material; material: NodeMaterial; version: number; mask: Node<"bool"> | null }
  >();
  private readonly assigned = new Map<Mesh, Mesh["material"]>();
  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly depth: Texture,
  ) {}
  private copy(base: Material, mode: "depth" | "color") {
    const key = `${mode}:${base.uuid}`;
    let entry = this.copies.get(key);
    if (!entry) {
      const native = this.renderer.library.fromMaterial(base);
      if (!native) throw Error("Unsupported scene material");
      const material = native.clone() as NodeMaterial;
      if (native !== base) native.dispose();
      let mask: Node<"bool"> | null = null;
      if (mode === "depth") {
        if (material.opacityNode)
          mask = float(material.opacityNode as Node<"float">).greaterThanEqual(0.999);
      } else {
        const clip = this.viewProjection.mul(vec4(positionWorld, 1));
        const ndc = clip.xyz.div(clip.w);
        const uv = vec2(ndc.x.mul(0.5).add(0.5), ndc.y.mul(-0.5).add(0.5));
        const z =
          this.renderer.coordinateSystem === WebGPUCoordinateSystem
            ? ndc.z
            : ndc.z.mul(0.5).add(0.5);
        mask = this.occlusion
          .lessThan(0.5)
          .or(texture(this.depth, uv).r.add(fwidth(z).mul(1.5).add(0.000005)).greaterThanEqual(z));
      }
      if (material.maskNode && mask) mask = bool(material.maskNode as Node<"bool">).and(mask);
      entry = { base, material, version: -1, mask };
      this.copies.set(key, entry);
    }
    const material = entry.material;
    copySpatialMaterial(material, base);
    if (mode === "depth") {
      // Evaluate shared lighting here so native shadow maps are generated once for the full world.
      material.colorWrite = true;
      material.depthWrite = base.depthWrite && base.opacity >= 1;
      material.transparent = false;
    }
    material.maskNode = entry.mask;
    if (entry.version !== base.version) {
      material.needsUpdate = true;
      entry.version = base.version;
    }
    return material;
  }
  apply(scene: Scene, mode: "depth" | "color") {
    this.restore();
    scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const original = node.material;
      this.assigned.set(node, original);
      node.material = Array.isArray(original)
        ? original.map((m) => this.copy(m, mode))
        : this.copy(original, mode);
    });
  }
  restore() {
    for (const [mesh, material] of this.assigned) mesh.material = material;
    this.assigned.clear();
  }
  key(mode: "depth" | "color") {
    return [...this.copies]
      .filter(([key]) => key.startsWith(`${mode}:`))
      .map(([, e]) => `${e.material.uuid}:${e.version}`)
      .join(",");
  }
  prune(active: ReadonlySet<Material>) {
    for (const [key, entry] of this.copies)
      if (!active.has(entry.base)) {
        entry.material.dispose();
        this.copies.delete(key);
      }
  }
  get bytes() {
    return this.copies.size * 2048;
  }
  dispose() {
    this.restore();
    for (const entry of this.copies.values()) entry.material.dispose();
    this.copies.clear();
  }
}
