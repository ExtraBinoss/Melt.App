import { expect, test } from "vitest";
import { EFFECT_CATALOG } from "@musart/core";
import {
  EFFECT_FAMILY,
  effectCatalogEntries,
  filterEffectCatalog,
  normalizeEffectSearch,
} from "../../../../src/components/layers/catalog/model";
import { i18n } from "../../../../src/state/i18n";
import { EFFECT_SEARCH_ALIASES } from "../../../../src/components/layers/catalog/search-metadata";
import "../../../../src/components/layers/catalog/messages";
import "../../../../src/components/properties/effects/library-messages";
import "../../../../src/components/motion/transitions/messages";

test("every registered effect has exactly one presentation family and retains its core category", () => {
  expect(Object.keys(EFFECT_FAMILY).sort()).toEqual(Object.keys(EFFECT_CATALOG).sort());
  for (const category of ["effect", "adjustment"] as const) {
    const entries = effectCatalogEntries(category, i18n.getFixedT("fr"), "fr");
    expect(entries.map((entry) => entry.type).sort()).toEqual(
      Object.values(EFFECT_CATALOG)
        .filter((item) => item.category === category && !item.source && !item.retired)
        .map((item) => item.type)
        .sort(),
    );
    expect(entries.map((entry) => entry.label)).toEqual(
      entries
        .map((entry) => entry.label)
        .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base", numeric: true })),
    );
  }
});

test.each(["fr", "en"] as const)(
  "%s search discovers techniques within the single Blur entry and other effect selectors",
  (language) => {
    const entries = effectCatalogEntries("effect", i18n.getFixedT(language), language);
    for (const query of ["gauss", "bokeh", "bilateral", "bilatéral", "directionnel", "box"])
      expect(
        filterEffectCatalog(entries, query, "all").filter((entry) => entry.type === "blur"),
        query,
      ).toHaveLength(1);
    expect(filterEffectCatalog(entries, "bokeh", "blur").map((entry) => entry.type)).toEqual([
      "blur",
    ]);
    expect(filterEffectCatalog(entries, "worley", "all").map((entry) => entry.type)).toEqual([
      "noise",
    ]);
    expect(filterEffectCatalog(entries, "prewitt", "all").map((entry) => entry.type)).toEqual([
      "edge-detect",
    ]);
  },
);

test("descriptions and bilingual synonyms discover adjustments while retaining category boundaries", () => {
  const entries = effectCatalogEntries("adjustment", i18n.getFixedT("fr"), "fr");
  expect(
    filterEffectCatalog(entries, "diaphragmes photographique", "all").map((e) => e.type),
  ).toEqual(["exposure"]);
  expect(filterEffectCatalog(entries, "tons moyens", "all").map((e) => e.type)).toEqual(["gamma"]);
  expect(
    filterEffectCatalog(entries, "white balance", "all")
      .map((e) => e.type)
      .sort(),
  ).toEqual(["temperature", "tint"]);
  expect(filterEffectCatalog(entries, "bokeh", "all")).toEqual([]);
  expect(Object.keys(EFFECT_SEARCH_ALIASES).sort()).toEqual(Object.keys(EFFECT_CATALOG).sort());
});
test("search matches localized names, durable IDs and families, with accent-insensitive AND terms", () => {
  const entries = effectCatalogEntries("effect", i18n.getFixedT("fr"), "fr");
  expect(normalizeEffectSearch("  ÉCRANS  ")).toBe("ecrans");
  expect(filterEffectCatalog(entries, "FlOu", "all").map((entry) => entry.type)).toEqual(["blur"]);
  expect(filterEffectCatalog(entries, "ombre", "all").map((entry) => entry.type)).toEqual([
    "circle",
    "shadow",
  ]);
  expect(filterEffectCatalog(entries, "pink-phosphor", "all").map((entry) => entry.type)).toEqual([
    "pink-phosphor",
  ]);
  expect(
    filterEffectCatalog(entries, "retro ecrans", "all").every((entry) => entry.family === "retro"),
  ).toBe(true);
  expect(filterEffectCatalog(entries, "blur", "texture")).toEqual([]);
  expect(filterEffectCatalog(entries, "", "color").every((entry) => entry.family === "color")).toBe(
    true,
  );
  expect(filterEffectCatalog(entries, "absent-query", "all")).toEqual([]);
});
