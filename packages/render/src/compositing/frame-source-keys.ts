import type { Asset, Composition, Layer } from "@musart/core";
import { createSourceKeys } from "../cache/keys";
import type { RenderOptions } from "./types";
import { resolveEffectSettings, trailMode } from "@musart/core";

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
  // Auto is render context rather than document data. Include its resolved source mode
  // in both the owner and ancestor caches, even at time zero when history is empty.
  const trailKeys = new Map<string, string>();
  const byId = new Map(page.layers.map((layer) => [layer.id, layer]));
  for (const layer of page.layers) {
    const modes = layer.effects
      .filter((effect) => effect.type === "trail" && resolveEffectSettings(effect).mode === "auto")
      .map((effect) => [effect.id, trailMode(effect, page, layer.id)]);
    if (!modes.length) continue;
    const stamp = `:trail-mode:${JSON.stringify(modes)}`;
    let owner: Layer | undefined = layer;
    while (owner) {
      trailKeys.set(owner.id, (trailKeys.get(owner.id) ?? "") + stamp);
      owner = owner.parentId ? byId.get(owner.parentId) : undefined;
    }
  }
  return {
    density,
    keyFor: (layer: Layer) => sourceKeys(layer) + density + (trailKeys.get(layer.id) ?? ""),
    referenceKeyFor: (layer: Layer) =>
      referenceKeys(layer) + density + (trailKeys.get(layer.id) ?? ""),
  };
}
