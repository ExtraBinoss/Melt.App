import { expect, test } from "vitest";
import {
  SPATIAL_MATERIALS,
  SPATIAL_MATERIAL_CATEGORIES,
  SPATIAL_ENVIRONMENT_PRESETS,
  SPATIAL_ENVIRONMENT_CATEGORIES,
} from "@musart/core";
import { i18n } from "../../../src/state/i18n";
import { supportedLocales } from "../../../src/state/i18n/locales";
import "../../../src/ui/studio/catalog/names";

const modules = import.meta.glob("../../../src/ui/studio/catalog/locales/*.json", {
  eager: true,
  import: "default",
});

test("every material, environment and category has a localized name in every supported language", () => {
  for (const { code } of supportedLocales) {
    const resource = modules[`../../../src/ui/studio/catalog/locales/${code}.json`];
    expect(resource, code).toBeDefined();
    expect(i18n.getResourceBundle(code, "studioCatalog"), code).toEqual(resource);
    for (const [kind, categories] of [
      ["material", SPATIAL_MATERIAL_CATEGORIES],
      ["environment", SPATIAL_ENVIRONMENT_CATEGORIES],
    ] as const) {
      for (const category of categories)
        expect(
          i18n.exists(`studioCatalog:${kind}Categories.${category.id}`, {
            lng: code,
            fallbackLng: false,
          }),
        ).toBe(true);
    }
    for (const [kind, presets] of [
      ["materialNames", SPATIAL_MATERIALS],
      ["environments", SPATIAL_ENVIRONMENT_PRESETS],
    ] as const) {
      for (const preset of presets) {
        expect(
          i18n.exists(`spatial:${kind}.${preset.baseId}`, { lng: code, fallbackLng: false }),
          `${code}:${preset.id}`,
        ).toBe(true);
        if (preset.variant)
          expect(
            i18n.exists(`studioCatalog:variants.${preset.variant}`, {
              lng: code,
              fallbackLng: false,
            }),
            `${code}:${preset.id}`,
          ).toBe(true);
      }
    }
    const composed = i18n.t("studioCatalog:variantName", {
      lng: code,
      base: "BASE",
      variant: "VARIANT",
    });
    expect(composed).toContain("BASE");
    expect(composed).toContain("VARIANT");
  }
});
