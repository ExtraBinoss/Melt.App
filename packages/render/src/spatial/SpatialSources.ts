import {
  createLayerGeometryIndex,
  DEFAULT_SPATIAL_SCENE,
  isSceneAsset,
  type Asset,
  type Composition,
  type Layer,
  type SpatialScene,
} from "@musart/core";
import type { RenderTarget, WebGPURenderer } from "three/webgpu";
import { GpuResourceCache } from "../cache/GpuResourceCache";
import { assetIdentity } from "../cache/keys";
import { FontRepository, type FontResolver } from "../surface/text/fonts";
import { GeometryBuilder } from "./GeometryBuilder";
import { spatialGeometryJob, spatialGeometryKey } from "./outlines";
import { EnvironmentSources } from "./EnvironmentSources";
import { SpatialResource } from "./SpatialResource";
import { SpatialOutputPass } from "./OutputPass";
import { disposeModels, glbMetadata, loadGlb, normalizeModel } from "./glb";
interface Prepared {
  resource: SpatialResource;
  settings: SpatialScene;
}
export class SpatialSources {
  passes = 0;
  parses = 0;
  private readonly fonts: FontRepository;
  private readonly builder = new GeometryBuilder();
  private readonly environments: EnvironmentSources;
  private readonly output: SpatialOutputPass;
  private readonly prepared = new Map<string, Prepared>();
  private readonly retained = new Map<string, WeakRef<SpatialResource>>();
  private closed = false;
  private readonly diagnostics =
    typeof location !== "undefined" && new URLSearchParams(location.search).has("profile3d");
  private trace(stage: string) {
    if (this.diagnostics) {
      console.debug("[Melt 3D]", stage);
      this.renderer.domElement.dataset.spatialPreparation = stage;
    }
  }
  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly cache: GpuResourceCache,
    options: { fontResolver?: FontResolver } = {},
  ) {
    this.fonts = new FontRepository({ resolver: options.fontResolver });
    this.environments = new EnvironmentSources(renderer, cache);
    this.output = new SpatialOutputPass(renderer);
  }
  async prepare(
    page: Composition,
    assets: Record<string, Asset>,
    scale: number,
    target: RenderTarget,
    canContinue: () => boolean,
  ) {
    this.trace("start");
    this.prepared.clear();
    const geometry = createLayerGeometryIndex(page);
    const layers = page.layers.filter(
      (layer) =>
        layer.spatial?.enabled &&
        (geometry.isVisible(layer.id) ||
          (page.motion?.mode === "motion" &&
            layer.visible &&
            geometry.ancestors(layer.id).every((parent) => parent.visible))),
    );
    if (!layers.length) return;
    if (layers.length > 64) throw new RangeError("Composition exceeds the active 3D source budget");
    const settings = page.spatial ?? DEFAULT_SPATIAL_SCENE;
    this.trace("environment");
    const environment = await this.environments.prepare(settings.environment, assets, canContinue);
    this.trace("output");
    await this.output.prepare(target, canContinue);
    for (const layer of layers) {
      this.trace(`source:${layer.id}`);
      this.check(canContinue);
      const original = layer.assetId ? assets[layer.assetId] : undefined;
      const key = `spatial:source:${layer.id}:${layer.spatial!.source === "glb" ? assetIdentity(original) : spatialGeometryKey(layer)}`;
      let resource = this.cache.get<SpatialResource>(key);
      if (!resource) {
        if (layer.spatial!.source === "glb") {
          if (!original || !isSceneAsset(original) || original.kind !== "model3d")
            throw Error("GLB original is unavailable");
          const response = await fetch(original.dataUrl);
          const gltf = await loadGlb(await response.arrayBuffer(), this.renderer);
          try {
            glbMetadata(gltf.scene, gltf.animations);
            this.check(canContinue);
            disposeModels(
              gltf.scenes.filter((scene) => scene !== gltf.scene),
              gltf.scene,
            );
            resource = new SpatialResource(normalizeModel(gltf.scene), gltf.animations, settings);
          } catch (error) {
            disposeModels(gltf.scenes);
            throw error;
          }
        } else {
          const lease =
            layer.kind === "text"
              ? await this.fonts.acquire(layer.fontFamily, layer.fontWeight)
              : null;
          try {
            const job = spatialGeometryJob(layer, lease?.font);
            this.check(canContinue);
            this.trace(`geometry:${layer.id}`);
            const built = await this.builder.build(job);
            try {
              this.check(canContinue);
              resource = SpatialResource.primitive(built, settings, layer);
            } catch (error) {
              built.dispose();
              throw error;
            }
          } finally {
            lease?.release();
          }
        }
        this.cache.set(key, resource);
        this.parses++;
      }
      const reference = layer.effects.some((effect) => effect.enabled) || !!layer.mask?.enabled;
      const w = Math.max(1, Math.ceil(layer.width * (reference ? 1 : scale))),
        h = Math.max(1, Math.ceil(layer.height * (reference ? 1 : scale)));
      this.cache.ensureCapacity(key, resource.projectedBytes(w, h));
      resource.update(layer, settings, environment, w, h);
      this.cache.synchronize(key);
      this.trace(`material:${layer.id}`);
      await resource.prepare(this.renderer, settings, canContinue);
      this.check(canContinue);
      this.prepared.set(layer.id, { resource, settings });
      this.retained.set(layer.id, new WeakRef(resource));
    }
    this.trace("ready");
    const ids = new Set(page.layers.map((layer) => layer.id));
    for (const id of this.retained.keys()) if (!ids.has(id)) this.retained.delete(id);
  }
  stats() {
    let meshes = 0,
      vertices = 0,
      triangles = 0;
    for (const { resource } of this.prepared.values()) {
      const inventory = resource.inventory;
      meshes += inventory.meshes;
      vertices += inventory.vertices;
      triangles += inventory.triangles;
    }
    return { sources: this.prepared.size, meshes, vertices, triangles };
  }
  peek(layerId: string): SpatialResource | null {
    const value = this.retained.get(layerId)?.deref();
    return value && !value.closed ? value : null;
  }
  render(layer: Layer, target: RenderTarget) {
    const prepared = this.prepared.get(layer.id);
    if (!prepared || prepared.resource.closed) throw Error("3D source is not prepared");
    prepared.resource.render(this.renderer, prepared.settings);
    this.output.render(prepared.resource.target.texture, target);
    this.passes += 2;
  }
  private check(canContinue: () => boolean) {
    if (this.closed || !canContinue())
      throw new DOMException("3D preparation superseded", "AbortError");
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.builder.dispose();
    this.fonts.clear();
    this.environments.dispose();
    this.output.dispose();
    this.prepared.clear();
    this.retained.clear();
  }
}
