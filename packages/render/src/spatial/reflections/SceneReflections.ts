import { createLayerGeometryIndex, type Composition, type SpatialScene } from "@musart/core";
import { Matrix4, type Scene, type Texture, type WebGPURenderer } from "three/webgpu";
import type { GpuResourceCache } from "../../cache/GpuResourceCache";
import type { RenderOptions } from "../../compositing/types";
import type { EnvironmentSources } from "../EnvironmentSources";
import { REFLECTION_BUDGETS, type ReflectionSource, type ReflectionStats } from "./model";
import { admitMeshes, chooseProbes, enumerateMeshes } from "./meshes";
import { reflectionSignature } from "./signature";
import { ReflectionResource } from "./Resource";
/** One shared, bounded probe set per composition, shared by every receiving 3D source. */
export class SceneReflections {
  private current: ReflectionResource | null = null;
  private activity: RenderOptions["backgroundGpu"];
  private stopActivity: (() => void) | null = null;
  private pending = false;
  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly cache: GpuResourceCache,
    private readonly environments: EnvironmentSources,
  ) {}
  private releaseCurrent() {
    this.current?.capture.dispose();
    this.current?.bindings.dispose();
    this.current = null;
    this.pending = false;
  }
  private admit(activity: RenderOptions["backgroundGpu"]) {
    if (activity !== this.activity) {
      this.stopActivity?.();
      this.activity = activity;
      this.stopActivity =
        activity?.subscribe(() => {
          if (this.pending && activity.read()) {
            this.pending = false;
            activity.ready?.();
          }
        }) ?? null;
    }
  }
  async prepare(
    page: Composition,
    settings: SpatialScene,
    sources: ReflectionSource[],
    environment: Texture | null,
    options: RenderOptions,
    canContinue: () => boolean,
    scene: Scene,
  ) {
    this.admit(options.backgroundGpu ?? options.videoProxy);
    this.current?.bindings.restore();
    if ((settings.reflections?.mode ?? "scene") !== "scene" || !sources.length) {
      this.current?.capture.dispose();
      this.current?.bindings.dispose();
      this.current = null;
      this.pending = false;
      return;
    }
    const budget = REFLECTION_BUDGETS[settings.reflections?.quality ?? "balanced"];
    const geometry = createLayerGeometryIndex(page);
    const items = sources
      .filter(({ layer }) => !geometry.isMaskSource(layer.id) && geometry.isVisible(layer.id))
      .flatMap((source) => {
        const opacity = [source.layer, ...geometry.ancestors(source.layer.id)].reduce(
          (value, layer) => value * layer.opacity,
          1,
        );
        return enumerateMeshes(source, new Matrix4(), opacity);
      });
    if (items.length < 2) {
      this.releaseCurrent();
      return;
    }
    const { admitted, triangles, omitted } = admitMeshes(items, budget),
      choices = chooseProbes(admitted, budget.probes);
    if (!choices.length || admitted.length < 2) {
      this.releaseCurrent();
      return;
    }
    const key = `spatial:reflections:${page.id}:${settings.reflections?.quality ?? "balanced"}`;
    let resource = this.cache.get<ReflectionResource>(key);
    if (!resource) {
      resource = new ReflectionResource(budget);
      this.cache.set(key, resource);
    }
    if (this.current && this.current !== resource) {
      this.current.capture.dispose();
      this.current.bindings.dispose();
    }
    this.current = resource;
    this.cache.ensureCapacity(key, resource.projectedBytes(admitted));
    resource.stats = {
      ...resource.stats,
      captures: 0,
      resolution: budget.size,
      meshes: admitted.length,
      triangles,
      omittedMeshes: omitted,
      deferred: false,
    };
    const signature = reflectionSignature(
      admitted,
      sources,
      [environment?.uuid, settings.environment],
      settings.lights,
    );
    const changed = signature !== resource.signature;
    const blocked = options.mediaMode === "preview" && this.activity && !this.activity.read();
    const cadence =
      options.mediaMode === "playback" &&
      performance.now() - resource.lastCapture < 1000 / budget.fps;
    if (changed && !blocked && !cadence) {
      resource.capture.sync(admitted, scene, settings, environment);
      await resource.capture.prepare(this.renderer, canContinue);
      await resource.update(this.environments, choices, signature, canContinue);
      this.pending = false;
    } else if (changed) {
      resource.stats.deferred = true;
      this.pending = !!blocked;
    }
    resource.bindings.bind(this.renderer, admitted, resource.textures(), resource.revision);
    resource.stats.probes = resource.probes.filter((probe) => probe.target).length;
    resource.stats.receivers = resource.bindings.count;
    this.cache.synchronize(key);
  }
  stamp(layerId: string) {
    return this.current?.bindings.stamp(layerId) ?? null;
  }
  stats(): ReflectionStats | undefined {
    return this.current ? { ...this.current.stats } : undefined;
  }
  dispose() {
    this.pending = false;
    this.stopActivity?.();
    this.stopActivity = null;
    this.activity = undefined;
    this.current?.bindings.restore();
    this.current?.capture.dispose();
    this.current?.bindings.dispose();
    this.current = null;
  }
}
