import { expect, test } from "vitest";
import { i18n } from "../../../src/state/i18n";
import { supportedLocales } from "../../../src/state/i18n/locales";
import { messages } from "../../../src/components/search/messages";
import { messages as bindings } from "../../../src/components/search/keybindings/messages";
function leaves(resource: Record<string, unknown>, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(resource).flatMap(([key, value]) =>
      typeof value === "string"
        ? [[`${prefix}${key}`, value]]
        : Object.entries(leaves(value as Record<string, unknown>, `${prefix}${key}.`)),
    ),
  );
}
const placeholders = (text: string) =>
  [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();
test.each(supportedLocales.map(({ code }) => code))(
  "has complete search and shortcut resources without English fallback in %s",
  (language) => {
    for (const [namespace, resources] of [
      ["search", messages],
      ["keybindings", bindings],
    ] as const) {
      const english = leaves(resources.en),
        local = leaves(resources[language]!);
      expect(
        Object.keys(local)
          .filter((key) => !/^resultCount_(zero|two|few|many)$/.test(key))
          .sort(),
      ).toEqual(
        Object.keys(english)
          .filter((key) => !/^resultCount_(zero|two|few|many)$/.test(key))
          .sort(),
      );
      for (const [key, value] of Object.entries(local)) {
        expect(value.trim(), key).not.toBe("");
        expect(i18n.getResource(language, namespace, key), key).toBe(value);
        const original = english[key] ?? english.resultCount_other!;
        expect(placeholders(value), key).toEqual(placeholders(original));
      }
    }
    for (const count of [0, 1, 2, 3, 11, 1000000]) {
      const category = new Intl.PluralRules(language).select(count),
        key = `resultCount_${category}`;
      expect(typeof i18n.getResource(language, "search", key)).toBe("string");
      expect(i18n.t("search:resultCount", { lng: language, count, fallbackLng: false })).toContain(
        String(count),
      );
    }
  },
);
