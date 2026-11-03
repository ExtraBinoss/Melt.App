import { expect, test } from "vitest";
import {
  localeResources,
  registerFeatureTranslations,
} from "../../../src/state/i18n/feature-resources";
import {
  defaultLocale,
  isSupportedLocale,
  localeDirection,
  supportedLocales,
} from "../../../src/state/i18n/locales";
import { i18n } from "../../../src/state/i18n";
import { messages as site } from "../../../src/components/site/messages";
import { messages as landing } from "../../../src/components/projects/landing/messages";
import { messages as tools } from "../../../src/tools/messages";

function leaves(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") return { [prefix]: value };
  if (!value || typeof value !== "object") throw new Error(`Invalid translation at ${prefix}`);
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      Object.entries(leaves(child, `${prefix}.${key}`)),
    ),
  );
}

const featureJson = import.meta.glob("../../../src/**/locales/**/*.json", {
  eager: true,
  import: "default",
});
test("feature JSON has matching English/French keys and interpolation variables", () => {
  for (const [path, source] of Object.entries(featureJson)) {
    if (!path.endsWith("/en.json")) continue;
    const french = featureJson[path.replace(/en\.json$/, "fr.json")];
    expect(french, path).toBeDefined();
    const englishLeaves = leaves(source),
      frenchLeaves = leaves(french);
    const categories = new Intl.PluralRules("fr").resolvedOptions().pluralCategories;
    const extraPluralBase = (key: string) => {
      const match = /^(.*)_(zero|one|two|few|many|other)$/.exec(key);
      return match &&
        categories.includes(match[2] as Intl.LDMLPluralRule) &&
        englishLeaves[`${match[1]}_other`] !== undefined
        ? `${match[1]}_other`
        : undefined;
    };
    expect(
      Object.keys(frenchLeaves)
        .filter((key) => englishLeaves[key] !== undefined || !extraPluralBase(key))
        .sort(),
      path,
    ).toEqual(Object.keys(englishLeaves).sort());
    for (const [key, text] of Object.entries(frenchLeaves)) {
      const source = englishLeaves[key] ?? englishLeaves[extraPluralBase(key)!];
      expect(text.trim(), `${path}:${key}`).not.toBe("");
      expect(text.match(/{{[^}]+}}/g)?.sort() ?? [], `${path}:${key}`).toEqual(
        source?.match(/{{[^}]+}}/g)?.sort() ?? [],
      );
    }
    for (const [key, text] of Object.entries(englishLeaves)) {
      expect(text.trim(), `${path}:${key}`).not.toBe("");
      expect(frenchLeaves[key]?.trim(), `${path}:${key}`).not.toBe("");
      expect(frenchLeaves[key]?.match(/{{[^}]+}}/g)?.sort() ?? [], `${path}:${key}`).toEqual(
        text.match(/{{[^}]+}}/g)?.sort() ?? [],
      );
    }
  }
});

test("every advertised locale includes complete public copy and preserves interpolation", () => {
  expect(supportedLocales.length).toBeGreaterThan(10);
  expect(defaultLocale).toBe("en");
  for (const { code } of supportedLocales) {
    expect(isSupportedLocale(code)).toBe(true);
    for (const resource of [site, landing, tools]) {
      expect(resource[code], code).toBeDefined();
      const base = leaves(resource.en),
        translated = leaves(resource[code]);
      expect(Object.keys(translated).sort(), code).toEqual(Object.keys(base).sort());
      for (const [key, text] of Object.entries(translated)) {
        expect(text.trim(), `${code}:${key}`).not.toBe("");
        expect(text.match(/{{[^}]+}}/g)?.sort() ?? [], `${code}:${key}`).toEqual(
          base[key]?.match(/{{[^}]+}}/g)?.sort() ?? [],
        );
      }
    }
  }
  expect(isSupportedLocale("unknown")).toBe(false);
  expect(localeDirection("ar")).toBe("rtl");
  expect(localeDirection("ar-EG")).toBe("rtl");
  expect(localeDirection("fr")).toBe("ltr");
});

test("feature discovery accepts more locales and resolves only shared brand tokens", () => {
  const resource = localeResources(
    { en: { title: "{{brandName}} {{count}}" } },
    {
      "./locales/ja.json": { title: "{{brandName}} {{count}}", list: ["{{brandNameUpper}}"] },
      "./locales/invalid.json": null,
      "./README.md": { title: "Ignored" },
    },
  );
  expect(resource.en.title).toBe("Melt {{count}}");
  expect(resource.ja).toEqual({ title: "Melt {{count}}", list: ["MELT"] });
  expect(Object.keys(resource)).toEqual(["en", "ja"]);
  registerFeatureTranslations("extensible-test", resource);
  expect(i18n.t("extensible-test:title", { lng: "ja", count: 3 })).toBe("Melt 3");
  expect(i18n.t("extensible-test:title", { lng: "ar", count: 3 })).toBe("Melt 3");
});
