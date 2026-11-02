import { effectAssetIds, type ImageAsset, type Layer } from "@musart/core";
import { hasEffectTreatment } from "../effects/shared/active";
import { loadAsset } from "./sources";

interface ImageFootprint {
  width: number;
  height: number;
}

/** Effects and masks keep authored reference pixels; plain images need only their raster plane. */
export function imageFootprints(layers: readonly Layer[], scale?: number) {
  const footprints = new Map<string, ImageFootprint | null>();
  if (scale === undefined) return footprints;
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError("Invalid image source scale.");
  const clippingSources = new Set(
    layers.flatMap((layer) => (layer.clipping ? [layer.clipping.layerId] : [])),
  );
  for (const layer of layers) {
    for (const id of [
      layer.mask?.enabled ? layer.mask.assetId : null,
      ...effectAssetIds(layer.effects.filter(hasEffectTreatment)),
    ])
      if (id) footprints.set(id, null);
    if (!layer.assetId || footprints.get(layer.assetId) === null) continue;
    if (
      layer.kind !== "image" ||
      layer.spatial?.enabled ||
      layer.mask?.enabled ||
      layer.clipping ||
      clippingSources.has(layer.id) ||
      layer.effects.some(hasEffectTreatment)
    ) {
      footprints.set(layer.assetId, null);
      continue;
    }
    const previous = footprints.get(layer.assetId);
    footprints.set(layer.assetId, {
      width: Math.max(previous?.width ?? 0, Math.ceil(layer.width * scale)),
      height: Math.max(previous?.height ?? 0, Math.ceil(layer.height * scale)),
    });
  }
  return footprints;
}

export function imageDimension(
  width: number,
  height: number,
  footprint: ImageFootprint | null | undefined,
  cap?: number,
): number | undefined {
  const needed = footprint
    ? Math.ceil(
        Math.max(width, height) *
          Math.min(1, Math.max(footprint.width / width, footprint.height / height)),
      )
    : undefined;
  return needed === undefined ? cap : Math.min(needed, cap ?? needed);
}

/** Native image preparation; portable originals remain untouched. */
export async function prepareImage(
  image: HTMLImageElement | ImageBitmap,
  width: number,
  height: number,
  maxDimension?: number,
  forceBitmap = false,
): Promise<{
  image: HTMLImageElement | ImageBitmap;
  width: number;
  height: number;
  close?: () => void;
}> {
  if (maxDimension === undefined && !forceBitmap) return { image, width, height };
  if (maxDimension !== undefined && (!Number.isSafeInteger(maxDimension) || maxDimension < 1))
    throw new RangeError("Invalid preview image dimension.");
  const scale = Math.min(1, (maxDimension ?? Math.max(width, height)) / Math.max(width, height));
  if (scale === 1 && !forceBitmap) return { image, width, height };
  const resizeWidth = Math.max(1, Math.floor(width * scale));
  const resizeHeight = Math.max(1, Math.floor(height * scale));
  const bitmap = await createImageBitmap(image, {
    resizeWidth,
    resizeHeight,
    resizeQuality: "high",
    imageOrientation: "flipY",
    premultiplyAlpha: "none",
  });
  return {
    image: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    close: () => bitmap.close(),
  };
}

/** Called sequentially by TextureSources: only one temporary original decode remains alive. */
export async function prepareAssetImage(
  asset: ImageAsset,
  footprint: ImageFootprint | null | undefined,
  cap?: number,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (cap === undefined && !footprint) {
    const image = await loadAsset(asset);
    signal?.throwIfAborted();
    return prepareImage(
      image,
      image.naturalWidth || asset.width,
      image.naturalHeight || asset.height,
    );
  }
  const response = await fetch(asset.dataUrl, signal ? { signal } : {});
  if (!response.ok) throw new Error(`Image illisible : ${asset.name}`);
  const original = await createImageBitmap(await response.blob(), { premultiplyAlpha: "none" });
  try {
    signal?.throwIfAborted();
    const prepared = await prepareImage(
      original,
      original.width,
      original.height,
      imageDimension(original.width, original.height, footprint, cap),
      true,
    );
    if (signal?.aborted) {
      prepared.close?.();
      signal.throwIfAborted();
    }
    return prepared;
  } finally {
    original.close();
  }
}
