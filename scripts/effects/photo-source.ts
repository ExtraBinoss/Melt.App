import { createLayer, type EffectPreviewSource, type Layer } from "../../packages/core/src/index";

export const CATALOG_CELL = { width: 240, height: 180 } as const;
export function catalogPhoto(source: EffectPreviewSource, patch: Partial<Layer> = {}): Layer {
  return createLayer("image", {
    id: `catalog-photo-${source}`,
    name: source,
    x: 0,
    y: 0,
    ...CATALOG_CELL,
    assetId: `catalog-${source}`,
    ...patch,
  });
}
