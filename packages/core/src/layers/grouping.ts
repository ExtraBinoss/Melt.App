import { ensure } from "../errors";
import { createLayer } from "../document/factories";
import type { Composition } from "../document/model";
import { getLayer, assertEditable, selectedRoots } from "./access";
import { createSpatialLayer } from "../spatial/defaults";
import { SpatialGeometry } from "../spatial/geometry";
import { invertSpatial, transformSpatial } from "../spatial/matrix";
import { captureSpatialReparent } from "../spatial/reparent";
import { canUngroupSpatial } from "../spatial/grouping";
export function groupLayers(
  page: Composition,
  ids: string[],
  nextId: (prefix: string) => string,
): string {
  const selected = selectedRoots(page, ids);
  ensure(selected.length > 0, "INVALID_COMMAND", "Sélectionnez des calques à grouper");
  const parentId = selected[0]?.parentId ?? null;
  ensure(
    selected.every((layer) => layer.parentId === parentId),
    "INVALID_HIERARCHY",
    "Les calques doivent partager le même parent",
  );
  for (const layer of selected) assertEditable(page, layer);
  // A full-parent surface preserves rotated children without scaling their content.
  const parent = parentId ? getLayer(page, parentId) : page;
  const group = createLayer("group", {
    id: nextId("group"),
    parentId,
    x: 0,
    y: 0,
    width: parent.width,
    height: parent.height,
    name: "Groupe",
    fill: "transparent",
  });
  if (selected.every((layer) => layer.spatial?.enabled)) {
    const geometry = new SpatialGeometry(page);
    const centers = selected.map((layer) =>
      transformSpatial(geometry.worldMatrix(layer.id), [0, 0, 0]),
    );
    const center = [0, 1, 2].map(
      (axis) => centers.reduce((sum, p) => sum + p[axis]!, 0) / centers.length,
    );
    // The group pivot belongs to the inherited frame, independently of its children's TRS.
    const probe = createLayer("group", {
      ...group,
      spatial: { ...createSpatialLayer("group"), pivot: [0, 0, 0] },
    });
    const probePage = { ...page, layers: [...page.layers, probe] };
    const pivot = transformSpatial(
      invertSpatial(new SpatialGeometry(probePage).anchorMatrix(probe.id)),
      center,
    );
    group.spatial = { ...createSpatialLayer("group"), pivot: [pivot[0]!, pivot[1]!, pivot[2]!] };
  }
  const indices = selected.map((layer) => page.layers.indexOf(layer));
  page.layers.splice(Math.max(...indices) + 1, 0, group);
  for (const layer of selected) layer.parentId = group.id;
  return group.id;
}
export function ungroupLayers(page: Composition, ids: string[]): string[] {
  const selected = selectedRoots(page, ids);
  const nextSelection: string[] = [];
  for (const group of selected) {
    ensure(group.kind === "group", "INVALID_COMMAND", "Le calque n’est pas un groupe");
    assertEditable(page, group);
    const radians = (group.rotation * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const cx = group.width / 2;
    const cy = group.height / 2;
    const children = page.layers.filter((layer) => layer.parentId === group.id);
    const spatial = group.spatial?.enabled && group.spatial.source === "group";
    const restoreSpatial = captureSpatialReparent(
      page,
      children.map((child) => child.id),
    );
    ensure(
      !spatial || canUngroupSpatial(page, group),
      "ANIMATED_SPATIAL_GROUP",
      "This hierarchy needs timed transform baking before ungrouping",
    );
    // Group effects/opacity/masks cannot be flattened losslessly into independent layers.
    ensure(
      group.effects.length === 0 &&
        group.mask === null &&
        group.opacity === 1 &&
        group.blendMode === "normal",
      "INVALID_COMMAND",
      "Retirez les effets, masque et mélange du groupe avant de dégrouper",
    );
    for (const layer of children) {
      assertEditable(page, layer);
      const centerX = layer.x + layer.width / 2 - cx;
      const centerY = layer.y + layer.height / 2 - cy;
      layer.x = group.x + cx + cosine * centerX - sine * centerY - layer.width / 2;
      layer.y = group.y + cy + sine * centerX + cosine * centerY - layer.height / 2;
      layer.rotation += group.rotation;
      layer.visible = layer.visible && group.visible;
      layer.parentId = group.parentId;
      nextSelection.push(layer.id);
    }
    restoreSpatial();
    const childIds = new Set(children.map((layer) => layer.id));
    const insertion = page.layers
      .slice(0, page.layers.indexOf(group))
      .filter((layer) => !childIds.has(layer.id)).length;
    page.layers = page.layers.filter((layer) => layer.id !== group.id && !childIds.has(layer.id));
    page.layers.splice(insertion, 0, ...children);
  }
  return nextSelection;
}
