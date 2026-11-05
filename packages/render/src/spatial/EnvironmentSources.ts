import { isSceneAsset, spatialEnvironment, type Asset, type SpatialScene } from "@musart/core";
import {
  Color,
  EquirectangularReflectionMapping,
  PMREMGenerator,
  type CubeRenderTarget,
  type Texture,
  type Scene,
  type Vector3,
  type WebGPURenderer,
} from "three/webgpu";
import { decodeEnvironment, disposeEnvironmentInput } from "./environment-input";
import { createProceduralEnvironment } from "./procedural-environment";
import { GpuResourceCache, type GpuResource } from "../cache/GpuResourceCache";
import { assetIdentity } from "../cache/keys";
import { pmremScratchBytes, pmremTargetBytes } from "./pmrem-budget";
class EnvironmentResource implements GpuResource {
  readonly targets = 1;
  readonly bytes: number;
  constructor(readonly target: CubeRenderTarget) {
    this.bytes = pmremTargetBytes(target.width);
  }
  dispose() {
    this.target.dispose();
  }
}
/** Shared environment preparation, bounded by the compositor's GPU cache. */
export class EnvironmentSources {
  private generator: PMREMGenerator | null = null;
  private scratchBytes = 0;
  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly cache: GpuResourceCache,
  ) {}
  private getGenerator(size = 256) {
    const bytes = Math.max(this.scratchBytes, pmremScratchBytes(size));
    this.cache.reserveExternal("spatial:pmrem", bytes);
    this.scratchBytes = bytes;
    if (!this.generator) {
      this.generator = new PMREMGenerator(this.renderer);
    }
    return this.generator;
  }
  async captureScene(
    scene: Scene,
    position: Vector3,
    size: number,
    target: CubeRenderTarget | null,
    canContinue: () => boolean,
  ) {
    const generator = this.getGenerator(size);
    await generator.compileCubemapShader();
    if (!canContinue()) throw new DOMException("3D capture superseded", "AbortError");
    const previous = this.renderer.getRenderTarget(),
      face = this.renderer.getActiveCubeFace(),
      mip = this.renderer.getActiveMipmapLevel();
    const auto = this.renderer.autoClear,
      shadow = this.renderer.shadowMap.enabled,
      alpha = this.renderer.getClearAlpha(),
      color = this.renderer.getClearColor(new Color());
    try {
      this.renderer.shadowMap.enabled = false;
      return generator.fromScene(scene, 0, 0.01, 10000, { size, position, renderTarget: target });
    } finally {
      this.renderer.setRenderTarget(previous, face, mip);
      this.renderer.autoClear = auto;
      this.renderer.shadowMap.enabled = shadow;
      this.renderer.setClearColor(color, alpha);
    }
  }
  async prepare(
    settings: SpatialScene["environment"],
    assets: Record<string, Asset>,
    canContinue: () => boolean,
  ): Promise<Texture | null> {
    if (settings.preset === "none" && !settings.assetId) return null;
    const asset = settings.assetId ? assets[settings.assetId] : undefined;
    const key = `spatial:environment:${asset ? assetIdentity(asset) : settings.preset}`;
    const cached = this.cache.get<EnvironmentResource>(key);
    if (cached) return cached.target.texture;
    if (!canContinue()) throw new DOMException("3D preparation superseded", "AbortError");
    let target: CubeRenderTarget;
    if (asset) {
      if (!isSceneAsset(asset) || asset.kind !== "environment")
        throw Error("Environment original is unavailable");
      const { texture } = await decodeEnvironment(asset.dataUrl, asset.mime);
      try {
        if (!canContinue()) throw new DOMException("3D preparation superseded", "AbortError");
        const image = texture.image as { width: number; height: number };
        if (image.width > 4096 || image.height > 2048)
          throw Error("Environment exceeds 4096 × 2048 pixels");
        this.getGenerator(image.width / 4);
        this.cache.ensureCapacity(key, pmremTargetBytes(image.width / 4));
        texture.mapping = EquirectangularReflectionMapping;
        await this.generator!.compileEquirectangularShader();
        if (!canContinue()) throw new DOMException("3D preparation superseded", "AbortError");
        target = this.generator!.fromEquirectangular(texture);
      } finally {
        disposeEnvironmentInput(texture);
      }
    } else {
      this.getGenerator();
      this.cache.ensureCapacity(key, pmremTargetBytes(256));
      const room = createProceduralEnvironment(spatialEnvironment(settings.preset));
      try {
        await this.generator!.compileCubemapShader();
        if (!canContinue()) throw new DOMException("3D preparation superseded", "AbortError");
        target = this.generator!.fromScene(room.scene, 0.04, 0.1, 100, { size: 128 });
      } finally {
        room.dispose();
      }
    }
    const resource = new EnvironmentResource(target);
    this.cache.set(key, resource);
    return resource.target.texture;
  }
  dispose() {
    this.generator?.dispose();
    this.generator = null;
    this.cache.reserveExternal("spatial:pmrem", 0);
    this.scratchBytes = 0;
  }
}
