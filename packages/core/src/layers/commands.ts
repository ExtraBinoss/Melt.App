import { captureSpatialReparent } from "../spatial/reparent";
import { ensure } from "../errors";
import {
  getAncestors,
  getDescendants,
  getWorldMatrix,
  IDENTITY,
  invertMatrix,
  multiplyMatrices,
} from "./geometry";
import { getLayer, assertEditable, selectedRoots, deleteLayerTree } from "./access";
import { groupLayers, ungroupLayers } from "./grouping";
import type { CommandHandler } from "../session/context";
import { applyLayerPatches } from "./patches";
import { assertMotionHierarchyChange } from "../motion/hierarchy";
import { setLayerTransform } from "./affine";
export const addLayers: CommandHandler<"addLayers"> = ({ project, page, pageId }, command) => {
  for (const asset of command.assets ?? []) {
    ensure(!Object.hasOwn(project.assets, asset.id), "INVALID_COMMAND", "Ressource déjà présente");
    Object.defineProperty(project.assets, asset.id, {
      value: asset,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  page.layers.push(...command.layers);
  for (const layer of command.layers)
    if (layer.parentId)
      ensure(
        !getAncestors(page, layer.id).some((parent) => parent.locked),
        "LOCKED",
        "Groupe parent verrouillé",
      );
  return { pageId, selection: command.layers.map((layer) => layer.id) };
};
export const updateLayers: CommandHandler<"updateLayers"> = ({ page, pageId }, command) => {
  applyLayerPatches(
    page,
    [...new Set(command.ids)].map((id) => ({ id, patch: command.patch })),
  );
  return { pageId };
};
export const deleteLayers: CommandHandler<"deleteLayers"> = ({ page, pageId }, command) => {
  deleteLayerTree(page, command.ids);
  return { pageId, selection: [] };
};
export { duplicateLayers } from "./duplicate";
export const reorderLayer: CommandHandler<"reorderLayer"> = ({ page, pageId }, command) => {
  const layer = getLayer(page, command.id);
  assertEditable(page, layer);
  ensure(
    Number.isInteger(command.index) && command.index >= 0 && command.index < page.layers.length,
    "INVALID_COMMAND",
    "Position de calque invalide",
  );
  if (command.parentId !== undefined && command.parentId !== layer.parentId) {
    const restoreSpatial = captureSpatialReparent(page, [layer.id]);
    assertMotionHierarchyChange(page, [layer.id, ...(command.parentId ? [command.parentId] : [])]);
    if (command.parentId !== null) {
      const parent = getLayer(page, command.parentId);
      ensure(parent.kind === "group", "INVALID_HIERARCHY", "Parent non groupé");
      assertEditable(page, parent);
    }
    ensure(
      !getDescendants(page, [layer.id]).some((item) => item.id === command.parentId),
      "INVALID_HIERARCHY",
      "Parenté cyclique",
    );
    const world = getWorldMatrix(page, layer.id),
      parentWorld = command.parentId === null ? IDENTITY : getWorldMatrix(page, command.parentId);
    const local = multiplyMatrices(invertMatrix(parentWorld), world);
    setLayerTransform(layer, local, (Math.atan2(local[1], local[0]) * 180) / Math.PI);
    layer.parentId = command.parentId;
    restoreSpatial();
  }
  page.layers.splice(page.layers.indexOf(layer), 1);
  page.layers.splice(command.index, 0, layer);
  return { pageId };
};
export const createGroup: CommandHandler<"groupLayers"> = ({ page, pageId, nextId }, command) => {
  if (!selectedRoots(page, command.ids).every((layer) => layer.spatial?.enabled))
    assertMotionHierarchyChange(page, command.ids);
  return { pageId, selection: [groupLayers(page, command.ids, nextId)] };
};
export const removeGroup: CommandHandler<"ungroupLayers"> = ({ page, pageId }, command) => {
  if (
    !selectedRoots(page, command.ids).every(
      (layer) => layer.spatial?.enabled && layer.spatial.source === "group",
    )
  )
    assertMotionHierarchyChange(page, command.ids);
  return { pageId, selection: ungroupLayers(page, command.ids) };
};
