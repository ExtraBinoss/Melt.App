import { expect, test } from "@playwright/test";
import { photoMenuFixture } from "./support/effect-menu-hover";
import type {} from "../../apps/web/src/services/automation/automation";

test("native catalog discovers Blur techniques and adjustment descriptions with one add and undo", async ({
  page,
}) => {
  const plus = await photoMenuFixture(page);
  try {
    const initial = await page.evaluate(() => window.musart!.session());
    await plus.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("menuitem", { name: "Ajouter un effet", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("ArrowRight");
    const menu = page.locator('[data-slot="dropdown-menu-sub-content"][data-state="open"]');
    const search = menu.getByRole("searchbox");
    await search.fill("gauss");
    await expect(menu.getByRole("menuitem", { name: "Flou", exact: true })).toBeVisible();
    await search.fill("bokeh");
    await expect(menu.getByRole("menuitem")).toHaveCount(1);
    await expect(menu.getByRole("menuitem")).toHaveText("Flou");
    expect((await page.evaluate(() => window.musart!.session())).revision).toBe(initial.revision);
    await search.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Flou", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        window.musart!.snapshot().project.pages[0]!.layers[0]!.effects.map((effect) => effect.type),
      ),
    ).toEqual(["blur"]);
    await page.keyboard.press("Control+z");
    expect(await page.evaluate(() => window.musart!.session().canUndo)).toBe(false);

    await plus.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("menuitem", { name: "Ajouter un effet", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(
      page.getByRole("menuitem", { name: "Ajouter un réglage", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(menu.locator('[data-effect-category="adjustment"]')).toBeVisible();
    await menu.getByRole("searchbox").fill("tons moyens");
    await expect(menu.getByRole("menuitem")).toHaveCount(1);
    await expect(menu.getByRole("menuitem")).toHaveText("Gamma");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(plus).toBeFocused();
    expect(
      await page.evaluate(() => ({
        pointer: document.body.style.pointerEvents,
        overflow: document.body.style.overflow,
      })),
    ).toEqual({ pointer: "", overflow: "" });
  } finally {
    await page.evaluate(() => window.__effectMenuDomReads?.restore());
  }
});
