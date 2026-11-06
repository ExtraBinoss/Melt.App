import { expect, it } from "vitest";
import {
  catalogRows,
  CATALOG_ROW_HEIGHT,
  CATALOG_SLOT_HEIGHT,
} from "../../../../src/components/layers/catalog/rows";
import type { CatalogEntry } from "../../../../src/components/layers/catalog/model";
const entries = [
  { type: "gradient", family: "color", label: "Gradient", search: "gradient" },
  { type: "thermal", family: "color", label: "Thermal", search: "thermal" },
  { type: "ascii", family: "texture", label: "ASCII", search: "ascii" },
] as CatalogEntry[];
it("reserves compact category headings and full thumbnail rows without blank virtual rows", () => {
  const layout = catalogRows(entries, ["color", "texture", "blur"]);
  expect(layout.groups.map((group) => group.heading * CATALOG_SLOT_HEIGHT)).toEqual([0, 130]);
  expect(entries.map((entry) => layout.positions.get(entry.type)! * CATALOG_SLOT_HEIGHT)).toEqual([
    26, 78, 156,
  ]);
  expect(layout.count * CATALOG_SLOT_HEIGHT).toBe(2 * 26 + entries.length * CATALOG_ROW_HEIGHT);
  expect(layout.entries).toEqual(entries);
  expect(layout.groups[1]!.items[0]!.index).toBe(2);
});
it("removes empty headings when filtering the catalog", () => {
  const layout = catalogRows([entries[2]!], ["color", "texture"]);
  expect(layout.groups).toHaveLength(1);
  expect(layout.positions.get("ascii")! * CATALOG_SLOT_HEIGHT).toBe(26);
  expect(catalogRows([], ["color"]).count).toBe(0);
});
