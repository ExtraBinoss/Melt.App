import { colorOwner, colorTargets, writeTargetColor } from "@musart/core";
import type {
  ColorTarget,
  Command,
  Composition,
  DocumentColor,
  Layer,
  PaletteSwatch,
  SessionSnapshot,
} from "@musart/core";

/** Explicit identities are the only connection between saved swatches and document globals. */
export function paletteVariation(
  snapshot: SessionSnapshot,
  colors: readonly PaletteSwatch[],
  targets: readonly ColorTarget[] = [],
): {
  globals: DocumentColor[];
  preview: Partial<Composition> | null;
  commands?: Command[];
} {
  const swatches = new Map(colors.map((color) => [color.id, color]));
  const globals = (snapshot.project.colors ?? []).flatMap((color) => {
    const swatch = swatches.get(color.id);
    return swatch ? [{ ...color, value: swatch.value }] : [];
  });
  const localTargets = targets.filter((target) => target.pageId === snapshot.pageId);
  if (!globals.length && (!localTargets.length || !colors.length))
    return { globals, preview: null };
  const active = snapshot.project.pages.find((page) => page.id === snapshot.pageId)!;
  const page = structuredClone(active);
  const project = { ...snapshot.project, pages: [page] };
  const changed = new Map(globals.map((color) => [color.id, color.value]));
  for (const { owner, target, colorId } of colorTargets(project)) {
    const color = changed.get(colorId);
    if (color !== undefined) writeTargetColor(owner, target.property, color);
  }
  const layerFields = new Map<string, Set<keyof Layer>>(),
    pageFields = new Set<keyof Composition>();
  for (const target of localTargets) {
    const owner = colorOwner(project, target),
      linked = owner.colorLinks?.[target.property];
    if (!linked || !changed.has(linked)) writeTargetColor(owner, target.property, colors[0]!.value);
    if (target.layerId) {
      const fields = layerFields.get(target.layerId) ?? new Set<keyof Layer>();
      fields.add(target.effectId ? "effects" : (target.property as keyof Layer));
      if (!target.effectId && target.property === "fill" && "kind" in owner) {
        if (owner.fillGradient) {
          delete owner.fillGradient;
          fields.add("fillGradient");
        }
        if (owner.spatial && owner.spatial.useModelMaterials !== false) {
          owner.spatial = { ...owner.spatial, useModelMaterials: false };
          fields.add("spatial");
        }
        if (owner.vector && owner.vector.preserveColors !== false) {
          owner.vector = { ...owner.vector, preserveColors: false };
          fields.add("vector");
        }
      }
      layerFields.set(target.layerId, fields);
    } else {
      pageFields.add(target.effectId ? "effects" : "background");
      if (!target.effectId && page.backgroundGradient) {
        delete page.backgroundGradient;
        pageFields.add("backgroundGradient");
      }
    }
  }
  const commands: Command[] = [];
  if (pageFields.size)
    commands.push({
      type: "updatePage",
      patch: Object.fromEntries([...pageFields].map((key) => [key, page[key]])),
    });
  for (const [id, fields] of layerFields) {
    const layer = page.layers.find((layer) => layer.id === id)!;
    commands.push({
      type: "updateLayers",
      ids: [id],
      patch: Object.fromEntries([...fields].map((key) => [key, layer[key]])),
    });
  }
  return {
    globals,
    preview: {
      background: page.background,
      backgroundGradient: page.backgroundGradient,
      effects: page.effects,
      layers: page.layers,
    },
    ...(commands.length ? { commands } : {}),
  };
}
