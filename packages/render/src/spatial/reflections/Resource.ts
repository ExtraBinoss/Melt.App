import { Vector3, type RenderTarget, type Texture } from "three/webgpu";
import type { GpuResource } from "../../cache/GpuResourceCache";
import type { EnvironmentSources } from "../EnvironmentSources";
import type { ReflectionBudget, ReflectionStats } from "./model";
import type { CaptureMesh } from "./meshes";
import { CaptureScene } from "./CaptureScene";
import { ReflectionBindings } from "./bindings";
export class ReflectionResource implements GpuResource {
  readonly capture = new CaptureScene();
  readonly bindings = new ReflectionBindings();
  readonly probes: { target: RenderTarget | null; center: Vector3 }[] = [];
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
  projectedBytes(items: CaptureMesh[]) {
    // PMREM scene targets include half-float radiance and depth; shared scratch is reserved by EnvironmentSources.
    const targets =
      this.budget.probes * Math.max(3 * this.budget.size, 336) * 4 * this.budget.size * 12;
    return (
      targets +
      items.reduce(
        (bytes, item) =>
          bytes +
          ((item.original as import("three").InstancedMesh).instanceMatrix?.array.byteLength ?? 0),
        0,
      ) +
      items.length * 4096 +
      12
    );
  }
  get bytes() {
    return (
      this.capture.bytes +
      this.bindings.bytes +
      this.probes.reduce(
        (sum, probe) =>
          sum +
          (probe.target
            ? probe.target.width * probe.target.height * (probe.target.depthBuffer ? 12 : 8)
            : 0),
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
