import { colorTargets, writeTargetColor } from "@musart/core";
import type { Composition, DocumentColor, PaletteSwatch, SessionSnapshot } from "@musart/core";

/** Explicit identities are the only connection between saved swatches and document globals. */
export function paletteVariation(
  snapshot: SessionSnapshot,
  colors: readonly PaletteSwatch[],
): {
  globals: DocumentColor[];
  preview: Partial<Composition> | null;
} {
  const swatches = new Map(colors.map((color) => [color.id, color]));
  const globals = (snapshot.project.colors ?? []).flatMap((color) => {
    const swatch = swatches.get(color.id);
    return swatch ? [{ ...color, value: swatch.value }] : [];
  });
  if (!globals.length) return { globals, preview: null };
  const active = snapshot.project.pages.find((page) => page.id === snapshot.pageId)!;
  const page = structuredClone(active);
  const project = { ...snapshot.project, pages: [page] };
  const changed = new Map(globals.map((color) => [color.id, color.value]));
  for (const { owner, target, colorId } of colorTargets(project)) {
    const color = changed.get(colorId);
    if (color !== undefined) writeTargetColor(owner, target.property, color);
  }
  return {
    globals,
    preview: { background: page.background, effects: page.effects, layers: page.layers },
  };
}
