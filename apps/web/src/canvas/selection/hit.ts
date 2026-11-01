import {
  createLayerGeometryIndex,
  morphContentBounds,
  type Composition,
  type LayerGeometryIndex,
} from "@musart/core";
import type { Point } from "../viewport/view";
import { pickSpatialLayer } from "@musart/render/spatial";
import { canvasNativeRenderer, canvasSpatialSource } from "../render/plane-resources";

/** Pointer selection can explain a locked foreground without granting an editing gesture. */
export function canvasHit(
  page: Composition,
  point: Point,
  includeLocked = false,
  index: LayerGeometryIndex = createLayerGeometryIndex(page),
) {
  const canvas =
    !index.spatialLayers.length || typeof document === "undefined"
      ? null
      : document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas[data-page-id]");
  const renderer =
    canvas?.dataset.pageId === page.id && canvas.dataset.presentationReady === "true"
      ? canvasNativeRenderer(canvas)
      : null;
  const picked =
    renderer && canvas
      ? pickSpatialLayer(
          page,
          point,
          (id) => canvasSpatialSource(canvas, id),
          renderer.coordinateSystem,
          includeLocked,
          index,
        )
      : undefined;
  const layer = index.hitTest(point, {
    includeLocked,
    contentBounds: morphContentBounds,
    ...(picked !== undefined ? { spatialHit: (layer) => layer.id === picked } : {}),
  });
  return layer ? { layer, locked: index.isLocked(layer.id) } : null;
}
