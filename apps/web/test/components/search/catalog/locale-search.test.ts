import { expect, test } from "vitest";
import { createProject, EditorEngine } from "@musart/core";
import { i18n } from "../../../../src/state/i18n";
import { supportedLocales } from "../../../../src/state/i18n/locales";
import { SearchCatalog } from "../../../../src/components/search/catalog/cache";
import { searchItems } from "../../../../src/components/search/catalog/search";
import { bindingMatches } from "../../../../src/components/search/catalog/shortcut-search";
import { BINDING_COMMANDS } from "../../../../src/state/keybindings/registry";
import { bindingSnapshot } from "../../../../src/state/keybindings/preferences";
import "../../../../src/components/search/keybindings/messages";
const catalog = new SearchCatalog(),
  engine = new EditorEngine(createProject()),
  bindings = bindingSnapshot();
test.each(supportedLocales.map(({ code }) => code))(
  "indexes current-language and English names/descriptions in both search surfaces in %s",
  async (language) => {
    const previous = i18n.language;
    await i18n.changeLanguage(language);
    try {
      const t = (key: string) => String(i18n.t(key)),
        rows = catalog.read(engine.getSnapshot(), t, bindings, language);
      for (const command of BINDING_COMMANDS.filter(
        (command) => command.id.startsWith("action:") || command.id.startsWith("effect:"),
      )) {
        const item = rows.find((item) => item.id === command.id)!;
        expect(item, command.id).toBeDefined();
        const key = command.descriptionKey ?? `search:descriptions.${command.id.slice(7)}`;
        for (const locale of [language, "en"]) {
          const name = String(i18n.t(command.label, { lng: locale, fallbackLng: false })),
            description = String(i18n.t(key, { lng: locale, fallbackLng: false }));
          expect(name, command.id).not.toBe(command.label);
          expect(description, command.id).not.toBe(key);
          for (const query of [name, description]) {
            expect(
              searchItems(rows, query, "all").items.some((result) => result.id === command.id),
              `${language}: ${command.id}: ${query}`,
            ).toBe(true);
            expect(
              bindingMatches(command, bindings.bindings.get(command.id) ?? [], query, t),
              `${language}: ${query}`,
            ).toBe(true);
          }
        }
        expect(item.label).toBe(t(command.label));
        expect(item.description).toBe(t(key));
      }
      expect(searchItems(rows, "ctrl+j", "all").items[0]?.id).toBe("action:layerViaCopy");
      expect(
        searchItems(rows, "gauss", "all").items.some((item) => item.id === "effect:blur"),
      ).toBe(true);
      if (language !== "en" && language !== "fr") {
        const french = "Enregistrer",
          save = BINDING_COMMANDS.find((command) => command.id === "action:save")!;
        expect(searchItems(rows, french, "all").items.some((item) => item.id === save.id)).toBe(
          false,
        );
        expect(bindingMatches(save, bindings.bindings.get(save.id) ?? [], french, t)).toBe(false);
      }
    } finally {
      await i18n.changeLanguage(previous);
    }
  },
);
