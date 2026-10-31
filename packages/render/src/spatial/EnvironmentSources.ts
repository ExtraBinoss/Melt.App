import { isSceneAsset, type Asset, type SpatialScene } from "@musart/core";
import {
  Color,
  EquirectangularReflectionMapping,
  PMREMGenerator,
  Mesh,
  type RenderTarget,
  type Texture,
  type WebGPURenderer,
} from "three/webgpu";
import { decodeEnvironment, disposeEnvironmentInput } from "./environment-input";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GpuResourceCache, type GpuResource } from "../cache/GpuResourceCache";
import { assetIdentity } from "../cache/keys";
class EnvironmentResource implements GpuResource {
  readonly targets = 1;
  readonly bytes: number;
  constructor(readonly target: RenderTarget) {
    this.bytes = target.width * target.height * 8;
  }
  dispose() {
    this.target.dispose();
  }
}
/** Shared environment preparation, bounded by the compositor's GPU cache. */
export class EnvironmentSources {
  private generator: PMREMGenerator | null = null;
  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly cache: GpuResourceCache,
  ) {}
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
    this.cache.ensureCapacity(key, 40 * 1024 * 1024);
    if (!this.generator) {
      this.cache.reserveExternal("spatial:pmrem", 32 * 1024 * 1024);
      this.generator = new PMREMGenerator(this.renderer);
    }
    let target: RenderTarget;
    if (asset) {
      if (!isSceneAsset(asset) || asset.kind !== "environment")
        throw Error("Environment original is unavailable");
      const { texture } = await decodeEnvironment(asset.dataUrl, asset.mime);
      try {
        if (!canContinue()) throw new DOMException("3D preparation superseded", "AbortError");
        const image = texture.image as { width: number; height: number };
        if (image.width > 4096 || image.height > 2048)
          throw Error("Environment exceeds 4096 × 2048 pixels");
        texture.mapping = EquirectangularReflectionMapping;
        await this.generator.compileEquirectangularShader();
        if (!canContinue()) throw new DOMException("3D preparation superseded", "AbortError");
        target = this.generator.fromEquirectangular(texture);
      } finally {
        disposeEnvironmentInput(texture);
      }
    } else {
      const room = new RoomEnvironment();
      try {
        const colors: Record<string, string> = {
          sunset: "#FFB781",
          dawn: "#E0C6FF",
          night: "#8D9AD8",
          neon: "#D59BFF",
          warm: "#FFE1BC",
          cool: "#BDDDFF",
          gallery: "#F2ECE5",
          overcast: "#D3DBE6",
          contrast: "#AAAAAA",
          softbox: "#EEEEFF",
        };
        const tint = new Color(colors[settings.preset] ?? "#FFFFFF");
        room.traverse((node) => {
          if (node instanceof Mesh)
            for (const material of Array.isArray(node.material) ? node.material : [node.material])
              if ("color" in material && material.color instanceof Color)
                material.color.multiply(tint);
        });
        await this.generator.compileCubemapShader();
        if (!canContinue()) throw new DOMException("3D preparation superseded", "AbortError");
        target = this.generator.fromScene(room, 0.04, 0.1, 100, { size: 128 });
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
  }
}
