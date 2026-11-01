import { expect, test } from "vitest";
import { messages } from "../../../../src/components/layers/catalog/messages";
import { EFFECT_FAMILIES } from "../../../../src/components/layers/catalog/model";
import { i18n } from "../../../../src/state/i18n";
import { EFFECT_CATALOG } from "@musart/core";
test("category and filter copy is registered in English and French", () => {
  for (const language of ["fr", "en"] as const) {
    expect(Object.keys(messages[language].family).sort()).toEqual([...EFFECT_FAMILIES].sort());
    for (const key of [
      "search",
      "searchAdjustment",
      "familyLabel",
      "all",
      "empty",
      "emptyAdjustment",
    ] as const)
      expect(i18n.getFixedT(language)(`effectCatalog:${key}`)).toBe(messages[language][key]);
  }
});

test("every effect and adjustment has a localized searchable description", () => {
  const types = Object.keys(EFFECT_CATALOG).sort();
  for (const language of ["fr", "en"] as const) {
    expect(Object.keys(messages[language].description).sort()).toEqual(types);
    for (const description of Object.values(messages[language].description))
      expect(description.length).toBeGreaterThan(20);
  }
});
