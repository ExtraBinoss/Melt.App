import type { Composition } from "../document/model";
import { DEFAULT_SPATIAL_SCENE } from "./defaults";
/** Reframe a derived output without changing the world or its original camera gate. */
export function reframeSpatialScene(page: Composition, x: number, y: number) {
  if (!page.layers.some((layer) => layer.spatial?.enabled)) return page.spatial;
  const scene = page.spatial ?? DEFAULT_SPATIAL_SCENE;
  return {
    ...scene,
    viewport: {
      width: scene.viewport?.width ?? page.width,
      height: scene.viewport?.height ?? page.height,
      x: (scene.viewport?.x ?? 0) + x,
      y: (scene.viewport?.y ?? 0) + y,
    },
  };
}
