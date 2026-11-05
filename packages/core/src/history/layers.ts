import type { Layer } from "../document/model";
import { LAYER_MOTION_PROPERTIES } from "../motion/properties/layer";
import { captureEffects } from "./effects";
import {
  layerOwner,
  readPath,
  watchFields,
  type HistoryContext,
  type HistoryHandlers,
} from "./collector";
import type { LayerHistoryProperty } from "./model";
import { ZERO_INSETS } from "../layout/model";

const extra: readonly LayerHistoryProperty[] = [
  "fillGradient.centerX",
  "fillGradient.centerY",
  "fillGradient.radius",
  "fillGradient.radialShape",
  "name",
  "locked",
  "parentId",
  "assetId",
  "maskSource",
  "spatialContext",
  "vector.preserveColors",
  "vector.strokeOnly",
  "spatial.enabled",
  "spatial.source",
  "spatial.castShadow",
  "spatial.receiveShadow",
  "spatial.useModelMaterials",
  "spatial.material.preset",
  ...([0, 1, 2, 3] as const).map((key) => `affine.${key}` as const),
  ...(["margin", "padding"] as const).flatMap((key) =>
    (["top", "right", "bottom", "left"] as const).map((side) => `${key}.${side}` as const),
  ),
];
const fields = [...LAYER_MOTION_PROPERTIES, ...extra];
function values(layer: Layer) {
  return {
    ...layer,
    scaleX: layer.scaleX ?? 1,
    scaleY: layer.scaleY ?? 1,
    affine: layer.affine ?? [1, 0, 0, 1],
    margin: layer.margin ?? ZERO_INSETS,
    padding: layer.padding ?? ZERO_INSETS,
  };
}
function geometryChanged(a: Layer["vector"], b: Layer["vector"]): boolean {
  if (!a || !b) return a !== b;
  if (a.path !== b.path || a.viewBox !== b.viewBox || a.parts?.length !== b.parts?.length)
    return true;
  return !!a.parts?.some((part, index) => {
    const next = b.parts?.[index];
    return (
      !next ||
      part.path !== next.path ||
      part.fill !== next.fill ||
      part.stroke !== next.stroke ||
      part.strokeWidth !== next.strokeWidth ||
      part.opacity !== next.opacity ||
      part.fillRule !== next.fillRule ||
      part.linecap !== next.linecap ||
      part.linejoin !== next.linejoin ||
      part.nodeEditing?.path !== next.nodeEditing?.path ||
      part.nodeEditing?.rounding.length !== next.nodeEditing?.rounding.length ||
      part.matrix?.some((value, i) => value !== next.matrix?.[i]) ||
      part.nodeEditing?.rounding.some((corner, i) => {
        const other = next.nodeEditing?.rounding[i];
        return (
          !other ||
          corner.contour !== other.contour ||
          corner.node !== other.node ||
          corner.radius !== other.radius
        );
      })
    );
  });
}
export function captureLayerPatch(
  context: HistoryContext,
  id: string,
  patch: Partial<Layer>,
): void {
  const layer = context.layers().get(id);
  if (!layer) return; // The authoritative handler reports invalid targets.
  const owner = layerOwner(context.page, id);
  const selected = fields.filter((property) => Object.hasOwn(patch, property.split(".")[0]!));
  watchFields(context, owner, selected, () => values(layer), values({ ...layer, ...patch }));
  if (Object.hasOwn(patch, "mask")) {
    const maskOwner = { kind: "mask", compositionId: context.page.id, layerId: id } as const;
    if (!layer.mask || !patch.mask)
      context.history.action(patch.mask ? "add" : "delete", maskOwner);
    else
      watchFields(
        context,
        maskOwner,
        ["enabled", "inverted", "mode", "layerId"],
        () => layer.mask,
        patch.mask,
      );
  }
  if (Object.hasOwn(patch, "effects")) captureEffects(context, layer, patch.effects ?? []);
  if (Object.hasOwn(patch, "vector") && geometryChanged(layer.vector, patch.vector))
    context.history.action("geometry", owner);
  if (Object.hasOwn(patch, "fillGradient")) {
    const before = layer.fillGradient?.stops,
      after = patch.fillGradient?.stops;
    if (
      before?.length !== after?.length ||
      before?.some(
        (stop, index) =>
          stop.offset !== after?.[index]?.offset || stop.color !== after?.[index]?.color,
      )
    )
      context.history.action("gradientStops", owner);
  }
  if (
    Object.hasOwn(patch, "spatial") &&
    ["basis", "pivot"].some((key) => {
      const before = readPath(layer.spatial, key),
        after = readPath(patch.spatial, key);
      return Array.isArray(before) && Array.isArray(after)
        ? before.length !== after.length || before.some((value, i) => value !== after[i])
        : before !== after;
    })
  )
    context.history.action("spatialTransform", owner);
}
export const updateLayers: HistoryHandlers["updateLayers"] = (context, command) => {
  for (const id of new Set(command.ids)) captureLayerPatch(context, id, command.patch);
};
export const updateLayerPatches: HistoryHandlers["updateLayerPatches"] = (context, command) => {
  for (const { id, patch } of command.patches) captureLayerPatch(context, id, patch);
};
export const alignLayers: HistoryHandlers["alignLayers"] = (context, command) => {
  for (const id of command.ids) context.history.action("align", layerOwner(context.page, id));
};
export const distributeLayers: HistoryHandlers["distributeLayers"] = (context, command) => {
  for (const id of command.ids) context.history.action("distribute", layerOwner(context.page, id));
};
