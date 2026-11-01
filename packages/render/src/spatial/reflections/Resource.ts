import { InstancedMesh, Vector3, type CubeRenderTarget, type Texture } from "three/webgpu";
import type { GpuResource } from "../../cache/GpuResourceCache";
import type { EnvironmentSources } from "../EnvironmentSources";
import type { ReflectionBudget, ReflectionStats } from "./model";
import type { CaptureMesh } from "./meshes";
import { CaptureScene } from "./CaptureScene";
import { ReflectionBindings } from "./bindings";
import { pmremTargetBytes } from "../pmrem-budget";
export class ReflectionResource implements GpuResource {
  readonly capture = new CaptureScene();
  readonly bindings = new ReflectionBindings();
  readonly probes: { target: CubeRenderTarget | null; center: Vector3 }[] = [];
  signature = "";
  lastCapture = -Infinity;
  revision = 0;
  closed = false;
  stats: ReflectionStats = {
    probes: 0,
    captures: 0,
    resolution: 0,
    meshes: 0,
    triangles: 0,
    receivers: 0,
    omittedMeshes: 0,
    deferred: false,
  };
  constructor(readonly budget: ReflectionBudget) {}
  projectedBytes(contributors: CaptureMesh[], receivers: CaptureMesh[] = contributors) {
    // Output cubemaps have explicit radiance mips; source/depth scratch belongs to EnvironmentSources.
    const targets = this.budget.probes * pmremTargetBytes(this.budget.size);
    const materials = (item: CaptureMesh) =>
      Array.isArray(item.original.material) ? item.original.material.length : 1;
    const captureBytes = contributors.reduce(
      (bytes, item) =>
        bytes +
        materials(item) * 1024 +
        (item.original instanceof InstancedMesh
          ? item.original.instanceMatrix.array.byteLength +
            (item.original.instanceColor?.array.byteLength ?? 0)
          : 0),
      12,
    );
    // Receiver materials are private even when their geometry is excluded from capture.
    // Keep room for old bindings until bind() has released the previous material set.
    const receiverBytes = receivers.reduce((bytes, item) => bytes + materials(item) * 1024, 0);
    return (
      targets + Math.max(this.capture.bytes, captureBytes) + this.bindings.bytes + receiverBytes
    );
  }
  get bytes() {
    return (
      this.capture.bytes +
      this.bindings.bytes +
      this.probes.reduce(
        (sum, probe) => sum + (probe.target ? pmremTargetBytes(probe.target.width) : 0),
        0,
      )
    );
  }
  get targets() {
    return 1 + this.probes.filter((probe) => probe.target).length;
  }
  async update(
    environments: EnvironmentSources,
    choices: CaptureMesh[],
    signature: string,
    canContinue: () => boolean,
  ) {
    while (this.probes.length > choices.length) this.probes.pop()!.target?.dispose();
    for (const [index, choice] of choices.entries()) {
      if (!canContinue() || this.closed)
        throw new DOMException("Reflection capture superseded", "AbortError");
      const probe = this.probes[index] ?? { target: null, center: new Vector3() };
      this.probes[index] = probe;
      this.capture.hide(choice.key);
      try {
        probe.target = await environments.captureScene(
          this.capture.scene,
          choice.center,
          this.budget.size,
          probe.target,
          canContinue,
        );
        probe.center.copy(choice.center);
        this.stats.captures++;
      } finally {
        this.capture.show();
      }
    }
    if (!canContinue() || this.closed)
      throw new DOMException("Reflection capture superseded", "AbortError");
    this.signature = signature;
    this.lastCapture = performance.now();
    this.revision++;
  }
  textures(): { center: Vector3; texture: Texture }[] {
    return this.probes.flatMap((probe) =>
      probe.target ? [{ center: probe.center, texture: probe.target.texture }] : [],
    );
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.bindings.dispose();
    this.capture.dispose();
    for (const probe of this.probes) probe.target?.dispose();
    this.probes.length = 0;
  }
}
