import type { Asset, Composition, Layer } from "@musart/core";
import { createSourceKeys } from "../cache/keys";
import type { RenderOptions } from "./types";

export function referenceDensity(options: RenderOptions) {
  const scale = options.effectSourceScale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1)
    throw new RangeError("Invalid preview reference density.");
  return scale;
}

/** Source preparation density is part of retained pixels, including nested reference layers. */
export function frameSourceKeys(
  page: Composition,
  assets: Record<string, Asset>,
  options: RenderOptions,
  keyOptions: Parameters<typeof createSourceKeys>[3],
) {
  const scale = options.scale ?? 1,
    referenceScale = referenceDensity(options);
  const density =
    options.maxImageDimension === undefined &&
    options.imageSourceScale === undefined &&
    referenceScale === 1
      ? ""
      : `:images:${options.maxImageDimension ?? "native"}:${options.imageSourceScale ?? "native"}:${referenceScale}`;
  const sourceKeys = createSourceKeys(page, assets, scale, keyOptions);
  const referenceKeys =
    scale === referenceScale
      ? sourceKeys
      : createSourceKeys(page, assets, referenceScale, keyOptions);
  return {
    density,
    keyFor: (layer: Layer) => sourceKeys(layer) + density,
    referenceKeyFor: (layer: Layer) => referenceKeys(layer) + density,
  };
}
