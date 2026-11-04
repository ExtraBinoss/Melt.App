import { expect, test } from "vitest";
import { i18n } from "../../../src/state/i18n";
import { supportedLocales } from "../../../src/state/i18n/locales";
import { resources as workspaceModes } from "../../../src/components/projects/workspace-mode/messages";
import "../../../src/ui/studio/library/messages";
import "../../../src/ui/studio/background/messages";

const modules = import.meta.glob("../../../src/ui/studio/{library,background}/locales/*.json", {
  eager: true,
  import: "default",
});
const features = { studioLibrary: "library", studioBackground: "background" };

function resource(feature: string, language: string): Record<string, string> {
  return modules[`../../../src/ui/studio/${feature}/locales/${language}.json`] as Record<
    string,
    string
  >;
}

test("Studio library and background copy covers every locale and preserves interpolation", () => {
  for (const feature of Object.values(features)) {
    const english = resource(feature, "en");
    for (const { code } of supportedLocales) {
      const translated = resource(feature, code);
      expect(translated, `${feature}:${code}`).toBeDefined();
      expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort());
      for (const [key, text] of Object.entries(english)) {
        const value = translated[key];
        expect(value?.trim(), `${feature}:${code}:${key}`).toBeTruthy();
        expect(value?.match(/{{[^}]+}}/g)?.sort() ?? [], `${feature}:${code}:${key}`).toEqual(
          text.match(/{{[^}]+}}/g)?.sort() ?? [],
        );
      }
    }
  }
});

test("normal feature imports register every Studio library and background locale at runtime", () => {
  for (const [namespace, feature] of Object.entries(features)) {
    for (const { code } of supportedLocales) {
      const translated = resource(feature, code);
      expect(i18n.getResourceBundle(code, namespace), `${namespace}:${code}`).toEqual(translated);
      for (const [key, text] of Object.entries(translated)) {
        const options = { lng: code, count: 20, size: 12, progress: 45 };
        expect(i18n.t(`${namespace}:${key}`, options), `${namespace}:${code}:${key}`).toBe(
          i18n.services.interpolator.interpolate(text, options, code, {}),
        );
      }
    }
  }
});

test("the project workspace switch is fully registered in every supported locale", () => {
  for (const { code } of supportedLocales) {
    const translated = workspaceModes[code];
    expect(translated, code).toBeDefined();
    expect(Object.keys(translated!).sort()).toEqual(Object.keys(workspaceModes.en).sort());
    expect(i18n.getResourceBundle(code, "workspaceMode"), code).toEqual(translated);
    for (const [key, text] of Object.entries(translated!)) {
      expect(typeof text).toBe("string");
      expect(String(text).trim()).toBeTruthy();
      expect(i18n.t(`workspaceMode:${key}`, { lng: code })).toBe(text);
    }
  }
});
