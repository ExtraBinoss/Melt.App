import { expect, it } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { i18n } from "../../../../src/state/i18n";
import { createSearchCommandItems } from "../../../../src/components/search/catalog/items";
import { searchItems } from "../../../../src/components/search/catalog/search";
import { bindingSnapshot } from "../../../../src/state/keybindings/preferences";
import "../../../../src/components/search/messages";
it("finds actual default/custom shortcuts with spaces, plus signs and platform aliases", () => {
  const engine = new EditorEngine(createProject());
  const t = (key: string) => String(i18n.t(key, { lng: "fr" }));
  const items = createSearchCommandItems(engine.getSnapshot(), t);
  for (const query of ["ctrl j", "ctrl+j", "Control + J", "cmd j", "⌘J"])
    expect(searchItems(items, query, "all").items[0]?.id).toBe("action:layerViaCopy");
  expect(searchItems(items, "ctrl shift j", "all").items[0]?.id).toBe("action:layerViaCut");
  expect(searchItems(items, "ctrl+]", "all").items[0]?.id).toBe("action:bringForward");
  expect(searchItems(items, "ctrl++", "all").items[0]?.id).toBe("action:zoomIn");
  expect(searchItems(items, "ctrl shift i", "all").items[0]?.id).toBe("action:invertSelection");
  const custom = createSearchCommandItems(
    engine.getSnapshot(),
    t,
    bindingSnapshot({ "action:layerViaCopy": [{ key: "q", mod: true, alt: true, shift: false }] }),
  );
  expect(searchItems(custom, "ctrl alt q", "all").items[0]?.id).toBe("action:layerViaCopy");
  expect(
    searchItems(custom, "ctrl j", "all").items.some((item) => item.id === "action:layerViaCopy"),
  ).toBe(false);
});
it("indexes English/current names, meaningful descriptions and effect choices generically", () => {
  const image = createLayer("rectangle"),
    engine = new EditorEngine(createProject({ pages: [createPage({ layers: [image] })] }));
  engine.select([image.id]);
  const items = createSearchCommandItems(engine.getSnapshot(), (key) =>
    String(i18n.t(key, { lng: "fr" })),
  );
  for (const item of items.filter(
    (item) => item.target.kind === "action" || item.target.kind === "effect",
  )) {
    expect(item.description, item.id).toBeTruthy();
    expect(item.englishDescription, item.id).toBeTruthy();
    expect(item.description, item.id).not.toContain("search:");
  }
  expect(searchItems(items, "gauss", "all").items.some((item) => item.id === "effect:blur")).toBe(
    true,
  );
  expect(
    searchItems(items, "Soften image details", "all").items.some(
      (item) => item.id === "effect:blur",
    ),
  ).toBe(true);
  expect(
    searchItems(items, "shadow", "all").items.some((item) => item.id === "effect:shadow"),
  ).toBe(true);
  expect(
    searchItems(items, "layers one step", "all").items.some(
      (item) => item.id === "action:bringForward",
    ),
  ).toBe(true);
});
it("retains English descriptions alongside the active French descriptions", async () => {
  const language = i18n.language;
  await i18n.changeLanguage("fr");
  try {
    const items = createSearchCommandItems(new EditorEngine(createProject()).getSnapshot(), (key) =>
      String(i18n.t(key)),
    );
    for (const query of ["Adoucir les détails", "Soften image details"])
      expect(searchItems(items, query, "all").items.some((item) => item.id === "effect:blur")).toBe(
        true,
      );
    for (const query of ["retirer cette zone", "remove that area"])
      expect(
        searchItems(items, query, "all").items.some((item) => item.id === "action:layerViaCut"),
      ).toBe(true);
  } finally {
    await i18n.changeLanguage(language);
  }
});
