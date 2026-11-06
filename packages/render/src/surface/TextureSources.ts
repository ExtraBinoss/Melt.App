import { prepareVideoEffectInputs } from "./video-effect-inputs";
import { hasEffectTreatment } from "../effects/shared/active";
import {
  effectAssetIds,
  isVideoAsset,
  isImageAsset,
  isSceneAsset,
  type Asset,
  type Composition,
  type Layer,
} from "@musart/core";
import { LinearFilter, NoColorSpace, Texture, type WebGPURenderer } from "three/webgpu";
import { assetIdentity } from "../cache/keys";
import { GpuResourceCache, type GpuResource } from "../cache/GpuResourceCache";
import { MediaVideoSources } from "../sources/media/video-sources";
import type { RenderOptions } from "../compositing/types";
import { assertTextureSize } from "../cache/texture-limits";
import { imageFootprints, prepareAssetImage } from "./image-preparation";
import { prepareVideoMasks } from "./video-masks";

class ImageResource implements GpuResource {
  readonly targets = 0;
  readonly bytes: number;
  constructor(
    readonly texture: Texture,
    width: number,
    height: number,
    private readonly close?: () => void,
  ) {
    this.bytes = width * height * 4;
  }
  dispose(): void {
    this.texture.dispose();
    this.close?.();
  }
}
function configure(texture: Texture): Texture {
  texture.colorSpace = NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
export class TextureSources {
  private imageUploads = 0;
  private videos: MediaVideoSources | null = null;
  private videoEffects = new Map<string, string>();
  private videoMasks = new Map<string, string>();
  get uploads(): number {
    return this.imageUploads + (this.videos?.uploads ?? 0);
  }
  private readonly prepared = new Map<string, Texture>();
  constructor(
    private readonly cache: GpuResourceCache,
    private readonly maxDimension: number,
    private readonly renderer?: WebGPURenderer,
  ) {}
  async prepare(
    page: Composition,
    assets: Record<string, Asset>,
    options: RenderOptions = {},
  ): Promise<void> {
    this.prepared.clear();
    const byParent = new Map<string | null, Layer[]>();
    for (const layer of page.layers) {
      const siblings = byParent.get(layer.parentId) ?? [];
      siblings.push(layer);
      byParent.set(layer.parentId, siblings);
    }
    const visible: Layer[] = [],
      futureVideos: Layer[] = [];
    const motion = page.motion?.mode === "motion";
    const parents = [{ id: null as string | null, transparent: false }];
    while (parents.length) {
      const parent = parents.pop()!;
      for (const layer of byParent.get(parent.id) ?? []) {
        if (!layer.visible) continue;
        const transparent = parent.transparent || layer.opacity === 0;
        if (layer.kind === "group" && (!transparent || motion))
          parents.push({ id: layer.id, transparent });
        if (transparent) {
          if (motion && layer.kind === "video") futureVideos.push(layer);
          continue;
        }
        visible.push(layer);
      }
    }
    // Prepare real posters/pipelines before an opacity-keyed first appearance, within the same
    // four-stream budget. Actual compositing still uses the authored/evaluated opacity unchanged.
    visible.push(
      ...futureVideos.slice(
        0,
        Math.max(0, 4 - visible.filter((layer) => layer.kind === "video").length),
      ),
    );
    const active = new Set(
      visible
        .flatMap((layer) => [
          layer.assetId,
          layer.mask?.enabled ? layer.mask.assetId : null,
          ...effectAssetIds(layer.effects.filter(hasEffectTreatment)),
        ])
        .filter((id): id is string => !!id),
    );
    for (const id of effectAssetIds((page.effects ?? []).filter(hasEffectTreatment)))
      active.add(id);
    const footprints = imageFootprints(visible, options.imageSourceScale);
    // An operator samples authored reference pixels even when its asset also appears as a small layer.
    for (const id of effectAssetIds((page.effects ?? []).filter(hasEffectTreatment)))
      footprints.set(id, null);
    for (const id of active) {
      const asset = assets[id];
      if (!asset) throw new Error(`Ressource introuvable : ${id}`);
      if (isVideoAsset(asset)) {
        continue;
      }
      if (isSceneAsset(asset)) continue;
      if (!isImageAsset(asset)) throw Error("Audio originals cannot be visual texture sources.");
      const footprint = footprints.get(id);
      const preparedKey =
        footprint || options.maxImageDimension !== undefined
          ? `:prepared:${footprint?.width ?? "native"}:${footprint?.height ?? "native"}:${options.maxImageDimension ?? "native"}`
          : "";
      const key = `asset:${assetIdentity(asset)}${preparedKey}`;
      let entry = this.cache.get<ImageResource>(key);
      if (!entry) {
        const prepared = await prepareAssetImage(
          asset,
          footprint,
          options.maxImageDimension,
          options.signal,
        );
        try {
          assertTextureSize(prepared.width, prepared.height, this.maxDimension);
          const texture = configure(new Texture(prepared.image));
          // ImageBitmap ignores WebGL unpack flips; native preparation flips both backends once.
          if (prepared.close) texture.flipY = false;
          entry = new ImageResource(texture, prepared.width, prepared.height, prepared.close);
        } catch (error) {
          prepared.close?.();
          throw error;
        }
        this.cache.set(key, entry);
        this.imageUploads++;
      }
      this.prepared.set(id, entry.texture);
    }
    const effectVideo = prepareVideoEffectInputs(visible, assets, options);
    this.videoEffects = effectVideo.ids;
    if (effectVideo.layers.some((layer) => layer.kind === "video")) {
      if (!this.renderer) throw Error("Video textures require an initialized Three.js renderer.");
      this.videos ??= new MediaVideoSources(this.renderer, this.cache, this.maxDimension);
    }
    const video = prepareVideoMasks(effectVideo.layers, assets, effectVideo.options);
    this.videoMasks = video.ids;
    await this.videos?.prepare(page.id, video.layers, assets, video.options);
  }
  effectImage(assetId: string, effectId?: string): Texture {
    const id = this.videoEffects.get(JSON.stringify([effectId, assetId]));
    return this.image(assetId, id);
  }
  videoStamp(layerId: string): string | null {
    const effectStamps = [...this.videoEffects.values()]
      .filter((id) => JSON.parse(id)[1] === layerId)
      .map((id) => this.videos?.stamp(id));
    const own = JSON.stringify([this.videos?.stamp(layerId) ?? null, effectStamps]);
    const mask = this.videoMasks.get(layerId);
    return mask ? JSON.stringify([own, this.videos?.stamp(mask)]) : own;
  }
  maskImage(assetId: string, ownerId: string): Texture {
    const mask = this.videoMasks.get(ownerId);
    return mask ? this.image(assetId, mask) : this.image(assetId);
  }
  videoStats() {
    return this.videos?.stats() ?? null;
  }
  async settle(): Promise<void> {
    await this.videos?.settle();
  }
  async dispose(): Promise<void> {
    this.prepared.clear();
    this.videoMasks.clear();
    this.videoEffects.clear();
    await this.videos?.dispose();
  }
  image(assetId: string | null, videoLayerId?: string): Texture {
    if (videoLayerId) {
      if (!this.videos) throw Error("Video GPU frame is unavailable.");
      return this.videos.image(videoLayerId);
    }
    const texture = assetId ? this.prepared.get(assetId) : undefined;
    if (!texture) throw new Error("Image GPU introuvable.");
    return texture;
  }
}
