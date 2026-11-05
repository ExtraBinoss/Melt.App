import { expect, test } from "vitest";
import { EFFECT_CATALOG } from "@musart/core";
import atlas from "../../../../src/components/layers/catalog/effect-atlas.json";

test("every searchable effect and adjustment has its own native atlas tile", () => {
  const eligible = Object.values(EFFECT_CATALOG)
    .filter((entry) => !entry.source && !entry.retired)
    .map((entry) => entry.type);
  expect([...atlas.entries].sort()).toEqual(eligible.sort());
  expect(new Set(atlas.entries).size).toBe(atlas.entries.length);
  expect(atlas.width).toBe(atlas.columns * atlas.cellWidth);
  expect(atlas.height).toBe(Math.ceil(atlas.entries.length / atlas.columns) * atlas.cellHeight);
});
