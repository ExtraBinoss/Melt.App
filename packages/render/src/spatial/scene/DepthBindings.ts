import {
  Matrix4,
  Mesh,
  type Material,
  type MeshStandardNodeMaterial,
  type NodeMaterial,
  type Node,
  type Scene,
  type Texture,
  type WebGPURenderer,
  WebGPUCoordinateSystem,
} from "three/webgpu";
import { bool, float, fwidth, positionWorld, texture, uniform, vec2, vec4 } from "three/tsl";
import { copySpatialMaterial } from "../material-copy";

type Mode = "depth" | "color";
interface Copy {
  base: Material;
  material: NodeMaterial;
  version: number;
  mask: Node<"bool"> | null;
  sourceMask: Node | null;
  sourceOpacity: Node | null;
  programKey: string;
  revision?: string;
  environment: Texture | null;
  sourceEnv: Node | null;
}
interface Binding {
  original: Mesh["material"];
  color: Mesh["material"];
  depth: Mesh["material"];
  holdout: Mesh["material"];
}

/** Synchronize borrowed material values once per sample; source passes only assign bindings. */
export class DepthBindings {
  readonly viewProjection = uniform(new Matrix4());
  readonly occlusion = uniform(1);
  private readonly copies = new Map<string, Copy>();
  private readonly bindings = new Map<Mesh, Binding>();
  private readonly assigned = new Map<Mesh, Mesh["material"]>();
  private synchronizations = 0;
  private assignments = 0;
  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly depth: Texture,
  ) {}
  private mask(material: NodeMaterial, mode: Mode) {
    let mask: Node<"bool"> | null = null;
    if (mode === "depth") {
      if (material.opacityNode)
        mask = float(material.opacityNode as Node<"float">).greaterThanEqual(0.999);
    } else {
      const clip = this.viewProjection.mul(vec4(positionWorld, 1));
      const ndc = clip.xyz.div(clip.w);
      const uv = vec2(ndc.x.mul(0.5).add(0.5), ndc.y.mul(-0.5).add(0.5));
      const z =
        this.renderer.coordinateSystem === WebGPUCoordinateSystem ? ndc.z : ndc.z.mul(0.5).add(0.5);
      mask = this.occlusion
        .lessThan(0.5)
        .or(texture(this.depth, uv).r.add(fwidth(z).mul(1.5).add(0.000005)).greaterThanEqual(z));
    }
    if (material.maskNode && mask) mask = bool(material.maskNode as Node<"bool">).and(mask);
    return mask;
  }
  private copy(
    base: Material,
    mode: Mode,
    writesDepth: boolean,
    synced: Set<string>,
    revision?: string,
  ) {
    const key = `${mode}:${mode === "depth" ? writesDepth : ""}:${base.uuid}`;
    let entry = this.copies.get(key);
    if (!entry) {
      const native = this.renderer.library.fromMaterial(base);
      if (!native) throw Error("Unsupported scene material");
      const material = native.clone() as NodeMaterial;
      if (native !== base) native.dispose();
      entry = {
        base,
        material,
        version: -1,
        mask: null,
        sourceMask: null,
        sourceOpacity: null,
        programKey: "",
        environment: null,
        sourceEnv: null,
      };
      this.copies.set(key, entry);
    }
    if (synced.has(key)) return entry.material;
    synced.add(key);
    const source = base as MeshStandardNodeMaterial;
    if (
      revision !== undefined &&
      entry.revision === revision &&
      entry.version === base.version &&
      entry.environment === (source.envMap ?? null) &&
      entry.sourceEnv === (source.envNode ?? null) &&
      entry.sourceMask === (source.maskNode ?? null) &&
      entry.sourceOpacity === (source.opacityNode ?? null)
    )
      return entry.material;
    const material = entry.material;
    // A version is a shader signal, not a value revision: color/uniform edits often keep it.
    copySpatialMaterial(material, base);
    this.synchronizations++;
    const mask = material.maskNode,
      opacity = material.opacityNode;
    const graphChanged = entry.sourceMask !== mask || entry.sourceOpacity !== opacity;
    if (entry.version === -1 || graphChanged) {
      entry.mask = this.mask(material, mode);
      entry.sourceMask = mask;
      entry.sourceOpacity = opacity;
    }
    if (mode === "depth") {
      // Keep native lighting evaluation so the shared prepass also produces native shadow maps.
      material.colorWrite = true;
      material.depthWrite = writesDepth && base.depthWrite && base.opacity >= 1;
      material.transparent = false;
    }
    material.maskNode = entry.mask;
    const programKey = material.customProgramCacheKey();
    if (entry.version !== base.version || entry.programKey !== programKey) {
      material.needsUpdate = true;
      entry.version = base.version;
      entry.programKey = programKey;
    }
    entry.revision = revision;
    entry.environment = source.envMap ?? null;
    entry.sourceEnv = source.envNode ?? null;
    return material;
  }
  /** Call after reflection bindings. An optional certified revision covers all material
   * values (including unversioned uniforms); omit it for arbitrary mutable materials.
   */
  sync(meshes: Iterable<Mesh>, revision?: string) {
    this.restore();
    this.bindings.clear();
    const active = new Set<Material>(),
      synced = new Set<string>();
    for (const mesh of meshes) {
      const original = mesh.material;
      const materials = Array.isArray(original) ? original : [original];
      for (const material of materials) active.add(material);
      const variant = (mode: Mode, writes: boolean): Mesh["material"] => {
        const result = materials.map((material) =>
          this.copy(material, mode, writes, synced, revision),
        );
        return Array.isArray(original) ? result : result[0]!;
      };
      this.bindings.set(mesh, {
        original,
        color: variant("color", true),
        depth: variant("depth", true),
        holdout: variant("depth", false),
      });
    }
    this.prune(active);
  }
  bind(meshes: Iterable<Mesh>, mode: Mode, writesDepth: (mesh: Mesh) => boolean = () => true) {
    this.restore();
    for (const mesh of meshes) {
      const binding = this.bindings.get(mesh);
      if (!binding) throw Error("Scene material binding is not prepared");
      this.assigned.set(mesh, binding.original);
      mesh.material =
        mode === "color" ? binding.color : writesDepth(mesh) ? binding.depth : binding.holdout;
      this.assignments++;
    }
  }
  /** Standalone convenience; retained composition rendering uses sync followed by bind. */
  apply(scene: Scene, mode: Mode, writesDepth: (mesh: Mesh) => boolean = () => true) {
    this.restore();
    const meshes: Mesh[] = [];
    scene.traverse((node) => {
      if (node instanceof Mesh) meshes.push(node);
    });
    this.sync(meshes);
    this.bind(meshes, mode, writesDepth);
  }
  restore() {
    for (const [mesh, material] of this.assigned) mesh.material = material;
    this.assigned.clear();
  }
  key(mode: Mode) {
    return [...this.copies]
      .filter(([key]) => key.startsWith(`${mode}:`))
      .map(([, e]) => `${e.material.uuid}:${e.material.version}`)
      .join(",");
  }
  prune(active: ReadonlySet<Material>) {
    for (const [key, entry] of this.copies)
      if (!active.has(entry.base)) {
        entry.material.dispose();
        this.copies.delete(key);
      }
    if (!active.size) this.bindings.clear();
  }
  stats() {
    return {
      synchronizations: this.synchronizations,
      assignments: this.assignments,
      meshes: this.bindings.size,
    };
  }
  get bytes() {
    return this.copies.size * 2048;
  }
  dispose() {
    this.restore();
    for (const entry of this.copies.values()) entry.material.dispose();
    this.copies.clear();
    this.bindings.clear();
  }
}
