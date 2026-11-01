import {
  createLayerGeometryIndex,
  SnapIndex,
  invertMatrix,
  layerTransform,
  transformPoint,
  type Command,
  type Composition,
  type Layer,
  type LayerGeometryIndex,
} from "@musart/core";
import { selectionContentBounds } from "../selection/content-bounds";
import type { Point } from "../viewport/view";

export type Tool =
  | "pointer"
  | "hand"
  | "shape"
  | "rectangle"
  | "ellipse"
  | "text"
  | "wand"
  | "segment";
export type Handle = "nw" | "n" | "ne" | "w" | "e" | "sw" | "s" | "se" | "rotate";
export interface LayerPatch {
  layerId: string;
  patch: Partial<Layer>;
}

export function clickSelection(
  selection: readonly string[],
  id: string,
  additive: boolean,
): string[] {
  return additive
    ? selection.includes(id)
      ? selection.filter((item) => item !== id)
      : [...selection, id]
    : selection.includes(id)
      ? [...selection]
      : [id];
}

export function selectedRoots(page: Composition, ids: string[]): Layer[] {
  const index = createLayerGeometryIndex(page),
    requested = new Set(ids),
    roots = new Set<string>();
  const pending = [{ parent: null as string | null, blocked: false }];
  while (pending.length) {
    const current = pending.pop()!;
    for (const layer of index.children(current.parent)) {
      const selected = requested.has(layer.id),
        blocked = current.blocked || layer.locked;
      if (selected && !blocked) roots.add(layer.id);
      if (layer.kind === "group") pending.push({ parent: layer.id, blocked: blocked || selected });
    }
  }
  return page.layers.filter((layer) => roots.has(layer.id));
}

export function movePatches(
  page: Composition,
  layers: Layer[],
  from: Point,
  to: Point,
  snapEnabled: boolean,
  threshold: number,
): LayerPatch[] {
  let target = to;
  if (snapEnabled && layers.length) {
    const snapping = new SnapIndex(
      page,
      layers.map((layer) => layer.id),
    );
    const bounds = snapping.movingBounds;
    if (bounds) {
      const { delta } = snapping.snap(
        { ...bounds, x: bounds.x + to.x - from.x, y: bounds.y + to.y - from.y },
        threshold,
      );
      target = { x: to.x + delta.x, y: to.y + delta.y };
    }
  }
  const index = createLayerGeometryIndex(page),
    inverses = new Map<string, ReturnType<typeof invertMatrix>>();
  return layers.map((layer) => {
    let inverse = layer.parentId ? inverses.get(layer.parentId) : undefined;
    if (layer.parentId && !inverse) {
      inverse = invertMatrix(index.worldMatrix(layer.parentId));
      inverses.set(layer.parentId, inverse);
    }
    const start = inverse ? transformPoint(inverse, from) : from;
    const end = inverse ? transformPoint(inverse, target) : target;
    return {
      layerId: layer.id,
      patch: { x: layer.x + end.x - start.x, y: layer.y + end.y - start.y },
    };
  });
}

export function resizePatch(
  page: Composition,
  layer: Layer,
  handle: Handle,
  from: Point,
  to: Point,
  keepAspect: boolean,
): LayerPatch {
  if (handle === "rotate") {
    const matrix = createLayerGeometryIndex(page).worldMatrix(layer.id);
    const center = transformPoint(matrix, { x: layer.width / 2, y: layer.height / 2 });
    const angle =
      ((Math.atan2(to.y - center.y, to.x - center.x) -
        Math.atan2(from.y - center.y, from.x - center.x)) *
        180) /
      Math.PI;
    const rotation = layer.rotation + angle;
    return {
      layerId: layer.id,
      patch: { rotation: keepAspect ? Math.round(rotation / 15) * 15 : rotation },
    };
  }
  const inverse = invertMatrix(createLayerGeometryIndex(page).worldMatrix(layer.id));
  const a = transformPoint(inverse, from);
  const b = transformPoint(inverse, to);
  const west = handle.includes("w");
  const north = handle.includes("n");
  const horizontal = west || handle.includes("e"),
    vertical = north || handle.includes("s");
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let width = horizontal ? Math.max(1, layer.width + (west ? -dx : dx)) : layer.width;
  let height = vertical ? Math.max(1, layer.height + (north ? -dy : dy)) : layer.height;
  if (keepAspect) {
    const xRatio = width / layer.width,
      yRatio = height / layer.height;
    const driven = !horizontal
      ? yRatio
      : !vertical
        ? xRatio
        : Math.abs(xRatio - 1) > Math.abs(yRatio - 1)
          ? xRatio
          : yRatio;
    const ratio = Math.max(driven, 1 / layer.width, 1 / layer.height);
    width = layer.width * ratio;
    height = layer.height * ratio;
  }
  // Keep the opposite corner or edge midpoint fixed, including mirrored/nonuniform scales.
  const anchorX = west ? 1 : horizontal ? 0 : 0.5;
  const anchorY = north ? 1 : vertical ? 0 : 0.5;
  const before = transformPoint(layerTransform(layer), {
    x: layer.width * anchorX,
    y: layer.height * anchorY,
  });
  const after = transformPoint(layerTransform({ ...layer, x: 0, y: 0, width, height }), {
    x: width * anchorX,
    y: height * anchorY,
  });
  const x = before.x - after.x,
    y = before.y - after.y;
  return { layerId: layer.id, patch: { x, y, width, height } };
}

export function patchesToCommands(patches: LayerPatch[]): Command[] {
  return patches.length
    ? [
        {
          type: "updateLayerPatches",
          patches: patches.map(({ layerId, patch }) => ({ id: layerId, patch })),
        },
      ]
    : [];
}

export function boxSelection(
  page: Composition,
  from: Point,
  to: Point,
  mode: "contain" | "intersect" = "contain",
  index: LayerGeometryIndex = createLayerGeometryIndex(page),
): string[] {
  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  const right = Math.max(from.x, to.x);
  const bottom = Math.max(from.y, to.y);
  return index
    .queryBounds({ x, y, width: right - x, height: bottom - y })
    .filter((layer) => {
      if (!index.isVisible(layer.id) || index.isLocked(layer.id) || index.isMaskSource(layer.id))
        return false;
      const bounds = selectionContentBounds(index, layer);
      return mode === "intersect"
        ? bounds.x < right &&
            bounds.y < bottom &&
            bounds.x + bounds.width > x &&
            bounds.y + bounds.height > y
        : bounds.x >= x &&
            bounds.y >= y &&
            bounds.x + bounds.width <= right &&
            bounds.y + bounds.height <= bottom;
    })
    .map((layer) => layer.id);
}

export function applyPreview(page: Composition, patches: LayerPatch[]): Composition {
  if (!patches.length) return page;
  const byId = new Map<string, Partial<Layer>>();
  for (const { layerId, patch } of patches) {
    const previous = byId.get(layerId);
    byId.set(layerId, previous ? { ...previous, ...patch } : patch);
  }
  return {
    ...page,
    layers: page.layers.map((layer) => {
      const patch = byId.get(layer.id);
      if (!patch) return layer;
      // Native assign is faster for large gesture batches; preserve data-only prototype keys.
      if (Object.hasOwn(layer, "__proto__") || Object.hasOwn(patch, "__proto__"))
        return { ...layer, ...patch };
      return Object.assign({}, layer, patch);
    }),
  };
}
