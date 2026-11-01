import type { CatalogEntry, EffectFamily } from "./model";

export const CATALOG_ROW_HEIGHT = 30;
export const CATALOG_PADDING = 4;
export interface CatalogGroup {
  family: EffectFamily;
  heading: number;
  items: { entry: CatalogEntry; row: number; index: number }[];
}
/** Layout metadata stays independent of mounted native menu items. */
export function catalogRows(entries: readonly CatalogEntry[], families: readonly EffectFamily[]) {
  let count = 0;
  const positions = new Map<string, number>();
  const groups: CatalogGroup[] = [];
  const ordered: CatalogEntry[] = [];
  for (const family of families) {
    const items = entries.filter((entry) => entry.family === family);
    if (!items.length) continue;
    const heading = count++;
    groups.push({
      family,
      heading,
      items: items.map((entry) => {
        const row = count++;
        const index = ordered.length;
        ordered.push(entry);
        positions.set(entry.type, row);
        return { entry, index, row };
      }),
    });
  }
  return { groups, positions, count, entries: ordered };
}
