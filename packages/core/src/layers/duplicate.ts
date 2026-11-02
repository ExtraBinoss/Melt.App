import { ensure } from "../errors";
import { getDescendants } from "./geometry";
import { selectedRoots, assertEditable } from "./access";
import { duplicateMotionTracks } from "../motion/structure";
import type { Layer } from "../document/model";
import type { CommandHandler } from "../session/context";
export const duplicateLayers: CommandHandler<"duplicateLayers"> = (
  { page, pageId, nextId },
  command,
) => {
  ensure(
    command.inPlace === undefined || typeof command.inPlace === "boolean",
    "INVALID_COMMAND",
    "Invalid duplicate placement.",
  );
  ensure(
    command.nameSuffix === undefined ||
      (typeof command.nameSuffix === "string" &&
        command.nameSuffix.length > 0 &&
        command.nameSuffix.length <= 80),
    "INVALID_COMMAND",
    "Invalid duplicate name suffix.",
  );
  const roots = selectedRoots(page, command.ids);
  for (const layer of roots) assertEditable(page, layer);
  const children = getDescendants(
    page,
    roots.map((layer) => layer.id),
  );
  const ids = new Map(children.map((layer) => [layer.id, nextId("layer")]));
  const rootIds = new Set(roots.map((layer) => layer.id));
  const effectIds = new Map<string, string>();
  const clones = children.map((layer) => ({
    ...layer,
    id: ids.get(layer.id)!,
    name: `${layer.name} ${command.nameSuffix ?? "copie"}`,
    x: layer.x + (!command.inPlace && rootIds.has(layer.id) ? 24 : 0),
    y: layer.y + (!command.inPlace && rootIds.has(layer.id) ? 24 : 0),
    parentId: layer.parentId ? (ids.get(layer.parentId) ?? layer.parentId) : null,
    effects: layer.effects.map((effect) => {
      const id = nextId("effect");
      effectIds.set(effect.id, id);
      return { ...effect, id };
    }),
    ...(layer.guides
      ? { guides: layer.guides.map((guide) => ({ ...guide, id: nextId("guide") })) }
      : {}),
    ...(layer.clipping
      ? { clipping: { layerId: ids.get(layer.clipping.layerId) ?? layer.clipping.layerId } }
      : {}),
    ...(layer.mask?.layerId
      ? { mask: { ...layer.mask, layerId: ids.get(layer.mask.layerId) ?? layer.mask.layerId } }
      : {}),
  }));
  if (command.inPlace) {
    const originals = new Map(page.layers.map((layer) => [layer.id, layer]));
    const bundles = new Map<string, Layer[]>();
    for (let index = 0; index < children.length; index++) {
      let owner = children[index]!;
      while (!rootIds.has(owner.id) && owner.parentId) owner = originals.get(owner.parentId)!;
      const bundle = bundles.get(owner.id) ?? [];
      bundle.push(clones[index]!);
      bundles.set(owner.id, bundle);
    }
    page.layers = page.layers.flatMap((layer) => [layer, ...(bundles.get(layer.id) ?? [])]);
  } else page.layers.push(...clones);
  duplicateMotionTracks(page, ids, effectIds, command.inPlace ? new Set() : rootIds, nextId);
  return { pageId, selection: roots.map((layer) => ids.get(layer.id)!) };
};
