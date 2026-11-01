import { expect, test, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { EffectCatalog } from "../../../../src/components/layers/catalog/EffectCatalog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../../../../src/components/ui/dropdown-menu";
import { setup } from "../../../support/ui";
import { choose } from "../../../support/select";
import { i18n } from "../../../../src/state/i18n";
vi.mock("motion/react", () => ({ useReducedMotion: () => true }));

function mount(category: "effect" | "adjustment" = "effect") {
  const d = setup(),
    add = vi.fn();
  d.mount(
    <DropdownMenu defaultOpen modal={false}>
      <DropdownMenuTrigger>Open</DropdownMenuTrigger>
      <DropdownMenuContent className="effect-catalog-menu">
        <EffectCatalog category={category} onAdd={add} />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  return { ...d, add };
}
test("localized category headings, text search and family filter share a real bounded scroll viewport", async () => {
  const d = mount();
  expect(screen.getByRole("group", { name: "Texture et impression" })).toBeVisible();
  expect(
    document.querySelector(".effect-catalog-scroll.scroll-shadow > .effect-catalog-viewport"),
  ).not.toBeNull();
  const search = screen.getByRole("searchbox", { name: "Rechercher un effet" });
  fireEvent.change(search, { target: { value: "flou" } });
  expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Flou"]);
  expect(d.add).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  fireEvent.change(search, { target: { value: "" } });
  await choose("Catégorie", "Texture et impression");
  expect(screen.queryByRole("menuitem", { name: "Flou" })).toBeNull();
  const texture = screen.getByRole("group", { name: "Texture et impression" });
  expect(within(texture).getAllByRole("menuitem").length).toBeGreaterThan(1);
  fireEvent.click(screen.getByRole("menuitem", { name: "Dither" }));
  expect(d.add).toHaveBeenCalledExactlyOnceWith("dither");
  expect(screen.queryByRole("menu")).toBeNull();
});
test("input owns typing and arrows, Escape dismisses, and a language change keeps the mounted filter live", async () => {
  const d = mount("adjustment");
  const search = screen.getByRole("searchbox", { name: "Rechercher un réglage" });
  fireEvent.change(search, { target: { value: "brightness" } });
  search.focus();
  fireEvent.keyDown(search, { key: "ArrowDown", isComposing: true });
  expect(search).toHaveFocus();
  fireEvent.keyDown(search, { key: "ArrowDown", keyCode: 229 });
  expect(search).toHaveFocus();
  fireEvent.keyDown(search, { key: "ArrowDown" });
  expect(screen.getByRole("menuitem", { name: "Luminosité" })).toHaveFocus();
  await act(async () => {
    await i18n.changeLanguage("en");
  });
  expect(screen.getByRole("searchbox", { name: "Search adjustments" })).toBe(search);
  expect(screen.getByRole("menuitem", { name: "Brightness" })).toBeVisible();
  fireEvent.change(search, { target: { value: "missing-query" } });
  expect(screen.getByRole("status")).toHaveTextContent("No matching adjustments");
  expect(d.add).not.toHaveBeenCalled();
  fireEvent.keyDown(search, { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  await act(async () => {
    await i18n.changeLanguage("fr");
  });
});

test.each([
  ["effect", "Flou", "Flou", "Blur"],
  ["adjustment", "Lumière et tonalité", "Contraste", "Brightness"],
] as const)(
  "%s search uses localized shared hints from its selected family without editing the document",
  async (category, family, frenchHint, englishHint) => {
    const d = mount(category);
    const snapshot = d.engine.getSnapshot();
    const search = screen.getByRole("searchbox");
    await choose("Catégorie", family);
    expect(search).toHaveAttribute("placeholder", `Rechercher ${frenchHint}…`);
    fireEvent.change(search, { target: { value: "missing-query" } });
    expect(screen.getByRole("status")).toBeVisible();
    fireEvent.change(search, { target: { value: "" } });
    expect(search).toHaveAttribute("placeholder", `Rechercher ${frenchHint}…`);
    try {
      await act(async () => {
        await i18n.changeLanguage("en");
      });
      expect(screen.getByRole("searchbox")).toBe(search);
      expect(search).toHaveAttribute("placeholder", `Search ${englishHint}…`);
      expect(d.add).not.toHaveBeenCalled();
      expect(d.engine.getSnapshot()).toBe(snapshot);
    } finally {
      await act(async () => {
        await i18n.changeLanguage("fr");
      });
    }
  },
);
