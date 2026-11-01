import {
  createLayerGeometryIndex,
  morphContentBounds,
  type Composition,
  type Layer,
  type LayerGeometryIndex,
} from "@musart/core";
import type { Point } from "../viewport/view";
import { pickSpatialLayer } from "@musart/render/spatial";
import { canvasNativeRenderer, canvasSpatialSource } from "../render/plane-resources";

/** Pointer selection can explain a locked foreground without granting an editing gesture. */
function nativeSpatialHit(
  page: Composition,
  point: Point,
  includeLocked: boolean,
  index: LayerGeometryIndex,
) {
  const canvas =
    !index.spatialLayers.length || typeof document === "undefined"
      ? null
      : document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas[data-page-id]");
  const renderer =
    canvas?.dataset.pageId === page.id && canvas.dataset.presentationReady === "true"
      ? canvasNativeRenderer(canvas)
      : null;
  return renderer && canvas
    ? pickSpatialLayer(
        page,
        point,
        (id) => canvasSpatialSource(canvas, id),
        renderer.coordinateSystem,
        includeLocked,
        index,
      )
    : undefined;
}

export function canvasHit(
  page: Composition,
  point: Point,
  includeLocked = false,
  index: LayerGeometryIndex = createLayerGeometryIndex(page),
) {
  const picked = nativeSpatialHit(page, point, includeLocked, index);
  const layer = index.hitTest(point, {
    includeLocked,
    contentBounds: morphContentBounds,
    ...(picked !== undefined ? { spatialHit: (layer) => layer.id === picked } : {}),
  });
  return layer ? { layer, locked: index.isLocked(layer.id) } : null;
}

/** A layer selected in the tree keeps its move target through overlapping artwork.
 * Test each selected shape with its real clipping ancestors, never the selection's
 * union rectangle. Spatial selections raycast only their actual retained meshes. */
export function canvasSelectionHit(
  page: Composition,
  point: Point,
  selection: readonly string[],
  index: LayerGeometryIndex = createLayerGeometryIndex(page),
  includeLocked = true,
) {
  const foreground = canvasHit(page, point, includeLocked, index);
  if (!selection.length || (foreground && selection.includes(foreground.layer.id)))
    return foreground;
  const candidates: { layer: Layer; chain: Layer[] }[] = [];
  for (const id of selection) {
    const layer = index.byId.get(id);
    if (!layer || !index.isVisible(id) || index.isLocked(id) || index.isMaskSource(id)) continue;
    const chain = [...index.ancestors(id), layer];
    if (chain.some((item) => item.spatialContext)) continue;
    candidates.push({ layer, chain });
  }
  // Hierarchical paint order can differ from the flat document positions when a
  // background group's descendants follow an unrelated foreground root.
  candidates.sort((a, b) => {
    const count = Math.min(a.chain.length, b.chain.length);
    for (let at = 0; at < count; at++) {
      const left = a.chain[at]!,
        right = b.chain[at]!;
      if (left.id !== right.id) return index.documentOrder(right.id) - index.documentOrder(left.id);
    }
    return b.chain.length - a.chain.length;
  });
  for (const { layer, chain } of candidates) {
    const spatial = chain.some((item) => item.spatial?.enabled);
    const layers = [...chain];
    if (spatial && layer.kind === "group") {
      const pending = [...index.children(layer.id)];
      while (pending.length) {
        const child = pending.pop()!;
        layers.push(child);
        if (child.kind === "group") pending.push(...index.children(child.id));
      }
    }
    const isolated = createLayerGeometryIndex({ ...page, layers });
    const native = spatial ? nativeSpatialHit(page, point, true, isolated) : undefined;
    // Missing/unprepared native resources never grant a bounds-only selected hit.
    if (spatial && !native) continue;
    const picked = isolated.hitTest(point, {
      contentBounds: morphContentBounds,
      ...(native ? { spatialHit: (item) => item.id === native } : {}),
    });
    if (
      picked &&
      (picked.id === layer.id ||
        (spatial && isolated.ancestors(picked.id).some((item) => item.id === layer.id)))
    )
      return { layer, locked: false };
  }
  return foreground;
}
