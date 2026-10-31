import {
  createLayerGeometryIndex,
  multiplyMatrices,
  type Composition,
  type Layer,
  type Matrix,
} from "@musart/core";
import type { View } from "../viewport/view";
export function vectorScreenMatrix(
  page: Composition,
  layer: Layer,
  view: View,
  size: { width: number; height: number },
): Matrix {
  const [x = 0, y = 0, width = 100, height = 100] = layer
    .vector!.viewBox.trim()
    .split(/[\s,]+/)
    .map(Number);
  const local: Matrix = [
    layer.width / width,
    0,
    0,
    layer.height / height,
    (-x * layer.width) / width,
    (-y * layer.height) / height,
  ];
  return multiplyMatrices(
    [
      view.zoom,
      0,
      0,
      view.zoom,
      size.width / 2 + view.x - (page.width * view.zoom) / 2,
      size.height / 2 + view.y - (page.height * view.zoom) / 2,
    ],
    multiplyMatrices(createLayerGeometryIndex(page).worldMatrix(layer.id), local),
  );
}
export function editableVector(page: Composition, id: string | undefined) {
  if (!id) return null;
  const index = createLayerGeometryIndex(page),
    layer = index.byId.get(id);
  return layer?.kind === "vector" &&
    layer.vector &&
    index.isVisible(id) &&
    !index.isLocked(id) &&
    !layer.maskSource &&
    !layer.effects.some((effect) => effect.enabled && effect.type === "morph" && effect.shapeMorph)
    ? layer
    : null;
}
