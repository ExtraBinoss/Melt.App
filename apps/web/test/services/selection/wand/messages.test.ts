import { expect, it } from "vitest";
import { i18n } from "../../../../src/state/i18n";
import { messages } from "../../../../src/services/selection/wand/messages";
import { messages as modelMessages } from "../../../../src/components/toolbar/segmentation/messages";
import { supportedLocales } from "../../../../src/state/i18n/locales";
const placeholders = (value: string) =>
  [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();
it.each(supportedLocales.map(({ code }) => code))(
  "registers complete selection and model controls without fallback in %s",
  (lng) => {
    for (const [namespace, resources] of [
      ["pixelSelection", messages],
      ["localModel", modelMessages],
    ] as const) {
      expect(Object.keys(resources[lng]!).sort()).toEqual(Object.keys(resources.en).sort());
      const localized: Record<string, unknown> = resources[lng]!;
      for (const [key, original] of Object.entries(resources.en)) {
        const value = localized[key];
        expect(typeof value).toBe("string");
        expect(String(value).trim().length).toBeGreaterThan(0);
        expect(placeholders(String(value))).toEqual(placeholders(original));
        expect(i18n.getResource(lng, namespace, key)).toBe(value);
        if (!String(value).includes("{{"))
          expect(i18n.t(`${namespace}:${key}`, { lng })).toBe(value);
      }
    }
    for (const key of [
      "segment",
      "wand",
      "tolerance",
      "prepareModel",
      "modelReady",
      "modelLoading",
      "modelHint",
      "processing",
      "cancel",
      "selectImageFirst",
    ]) {
      const value = i18n.getResource(lng, "translation", key);
      expect(typeof value).toBe("string");
      expect(String(value).trim().length).toBeGreaterThan(0);
      expect(i18n.t(key, { lng })).toBe(value);
    }
    expect(i18n.t("pixelSelection:tolerance", { lng, value: 42 })).toContain("42");
    expect(i18n.t("pixelSelection:selected", { lng, count: 6 })).toContain("6");
    expect(i18n.t("pixelSelection:objectCandidate", { lng, number: 3 })).toContain("3");
    expect(
      i18n.t("localModel:progress", { lng, loaded: "12 MB", total: "64 MB", percent: 19 }),
    ).toContain("19");
  },
);
