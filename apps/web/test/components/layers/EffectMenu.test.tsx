import { expect, test, vi } from "vitest";
import { act, fireEvent, screen, within, waitFor } from "@testing-library/react";
import { EFFECT_CATALOG, getEffectDefinition } from "@musart/core";
import { i18n } from "../../../src/state/i18n";
import { EffectMenu } from "../../../src/components/layers/EffectMenu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "../../../src/components/ui/dropdown-menu";
import { setup } from "../../support/ui";

function readCatalog(menu: HTMLElement, language: string) {
  const viewport = menu.querySelector<HTMLElement>(".effect-catalog-viewport")!;
  const height = parseFloat(
    menu.querySelector<HTMLElement>(".effect-catalog-virtual")!.style.height,
  );
  const entries = new Map<string, string>();
  for (let top = 0; top <= height + 180; top += 180) {
    act(() => {
      viewport.scrollTop = top;
      fireEvent.scroll(viewport);
    });
    for (const item of within(menu).getAllByRole("menuitem"))
      entries.set(item.dataset.effectCatalogItem!, item.textContent!.trim());
    for (const group of within(menu).getAllByRole("group")) {
      const labels = within(group)
        .queryAllByRole("menuitem")
        .map((node) => node.textContent!.trim());
      expect(labels).toEqual(
        [...labels].sort((a, b) =>
          a.localeCompare(b, language, { sensitivity: "base", numeric: true }),
        ),
      );
    }
  }
  return entries;
}

test.each(["effect", "adjustment"] as const)(
  "%s submenu groups the catalog and sorts each localized family in French and English",
  async (category) => {
    const d = setup();
    d.mount(
      <DropdownMenu defaultOpen modal={false}>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <EffectMenu onAdd={vi.fn()} />
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const key = category === "effect" ? "addEffect" : "addAdjustment";
    fireEvent.keyDown(screen.getByRole("menuitem", { name: i18n.t(key) }), { key: "ArrowRight" });
    try {
      for (const language of ["fr", "en"]) {
        await act(async () => {
          await i18n.changeLanguage(language);
        });
        const search = await screen.findByRole("searchbox");
        const entries = readCatalog(search.closest('[role="menu"]') as HTMLElement, language);
        const expected = Object.values(EFFECT_CATALOG)
          .filter((e) => e.category === category && !e.source && !e.retired)
          .map((e) => e.type);
        expect(new Set(entries.keys())).toEqual(new Set(expected));
      }
    } finally {
      await act(async () => {
        await i18n.changeLanguage("fr");
      });
    }
  },
);
test("separates clipped effects and adjustments and chooses a registered effect", async () => {
  const d = setup(),
    add = vi.fn();
  d.mount(
    <DropdownMenu defaultOpen modal={false}>
      <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <EffectMenu onAdd={add} />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  const effects = screen.getByRole("menuitem", { name: "Ajouter un effet" });
  expect(screen.getByRole("menuitem", { name: "Ajouter un réglage" })).toBeVisible();
  fireEvent.keyDown(effects, { key: "ArrowRight" });
  const item = await screen.findByRole("menuitem", { name: "Dither" });
  fireEvent.click(item);
  expect(add).toHaveBeenCalledWith("dither");
});

test("vertical category hover bypasses stale diagonal grace and keeps submenus outside the clipped parent", async () => {
  const d = setup(),
    add = vi.fn();
  d.mount(
    <DropdownMenu defaultOpen modal={false}>
      <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <EffectMenu onAdd={add} />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  const effects = screen.getByRole("menuitem", { name: "Ajouter un effet" });
  const adjustments = screen.getByRole("menuitem", { name: "Ajouter un réglage" });
  const parent = effects.closest('[role="menu"]')!;
  fireEvent.keyDown(effects, { key: "ArrowRight" });
  const item = await screen.findByRole("menuitem", { name: "Dither" });
  expect(document.querySelector('[data-effect-category="adjustment"]')).toBeNull();
  expect(document.querySelector('[data-slot="select-content"]')).toBeNull();
  const submenu = item.closest<HTMLElement>('[role="menu"]')!;
  expect(parent.contains(submenu)).toBe(false);
  submenu.dataset.side = "right";
  vi.spyOn(submenu, "getBoundingClientRect").mockReturnValue({
    left: 200,
    right: 380,
    top: 90,
    bottom: 540,
    width: 180,
    height: 450,
  } as DOMRect);
  function pointer(node: HTMLElement, type: string, relatedTarget: HTMLElement | null, y: number) {
    const event = new MouseEvent(type, {
      bubbles: true,
      clientX: 110,
      clientY: y,
      buttons: 0,
      relatedTarget,
    });
    Object.defineProperty(event, "pointerType", { value: "mouse" });
    fireEvent(node, event);
  }
  await act(async () => {
    pointer(effects, "pointermove", null, 108);
    pointer(effects, "pointerout", adjustments, 115);
    pointer(adjustments, "pointerover", effects, 118);
    pointer(
      screen.getByRole("menuitem", { name: "Ajouter un réglage" }),
      "pointermove",
      effects,
      118,
    );
  });
  const current = screen.getByRole("menuitem", { name: "Ajouter un réglage" });
  expect(current).toHaveAttribute("aria-expanded", "true");
  await waitFor(() => expect(current).toHaveAttribute("data-highlighted"));
  expect(screen.getByRole("menuitem", { name: "Ajouter un effet" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  const brightness = await screen.findByRole("menuitem", {
    name: i18n.t(getEffectDefinition("brightness").nameKey),
  });
  expect(brightness.closest('[role="menu"]')).toBe(submenu);
  fireEvent.click(brightness);
  expect(add).toHaveBeenCalledExactlyOnceWith("brightness");
});
