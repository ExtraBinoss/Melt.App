import {
  multiplyMatrices,
  type Composition,
  type Layer,
  type LayerGeometryIndex,
  type Matrix,
} from "@musart/core";
import { spatialSelectionBounds } from "@musart/render/spatial";
import { canvasSpatialSource } from "../render/canvas-owners";

/** Match handles to prepared native ink without changing its authored layout. */
export function resolveSelectionFrame(
  page: Composition,
  index: LayerGeometryIndex,
  layer: Layer,
  canvas?: HTMLCanvasElement | null,
) {
  const world = index.worldMatrix(layer.id);
  const resource =
    layer.spatial?.enabled &&
    canvas?.dataset.pageId === page.id &&
    canvas.dataset.presentationReady === "true" &&
    canvasSpatialSource(canvas, layer.id);
  const bounds = resource
    ? (spatialSelectionBounds(page, layer, resource) ?? undefined)
    : undefined;
  if (layer.spatial?.enabled && !bounds) {
    const fallback = index.worldBounds(layer.id);
    return {
      bounds: undefined,
      width: fallback.width,
      height: fallback.height,
      matrix: [1, 0, 0, 1, fallback.x, fallback.y] as Matrix,
    };
  }
  return {
    bounds,
    width: bounds?.width ?? layer.width,
    height: bounds?.height ?? layer.height,
    matrix: bounds ? multiplyMatrices(world, [1, 0, 0, 1, bounds.x, bounds.y]) : world,
  };
}

/** Source preparation finishes after document notifications. Repaint only this
 * selection surface when its existing native canvas presents the completed ink.
 */
export function observeSelectionPresentation(root: HTMLElement, paint: () => void) {
  const observer = new MutationObserver((records) => {
    if (
      records.some(
        (record) =>
          record.type === "childList" ||
          (record.target instanceof HTMLCanvasElement &&
            record.attributeName === "data-render-frames"),
      )
    )
      paint();
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-render-frames"],
  });
  return () => observer.disconnect();
}
