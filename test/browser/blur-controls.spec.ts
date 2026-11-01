import { expect, test } from "@playwright/test";
import { photographicEffect } from "./support/photographic-effect";

test("Blur selects techniques and related controls through the shared nonmodal field", async ({
  page,
}) => {
  const d = await photographicEffect(page, "blur", false);
  try {
    await d.load();
    await page.evaluate(() => window.musart!.select(["blur-image"]));
    const initial = await page.evaluate(() => {
      const state = window.musart!.snapshot();
      return { revision: state.revision, effect: state.project.pages[0]!.layers[0]!.effects[0]! };
    });
    await page.locator(`[data-attachment-effect-id="${initial.effect.id}"]`).first().click();
    const technique = page.getByRole("combobox", { name: "Technique", exact: true });
    await expect(technique).toBeVisible();
    const body = await page.evaluate(() => document.body.style.cssText);
    await technique.click();
    await expect(page.getByRole("option")).toHaveCount(7);
    await page.getByRole("option", { name: /^(Lens \(Bokeh\)|Objectif \(bokeh\))$/ }).click();
    await expect(
      page.getByRole("textbox", { name: /^(Aperture blades|Lamelles du diaphragme)$/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: /^(Direction angle|Angle de direction)$/ }),
    ).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.cssText)).toBe(body);
    const afterSelect = await page.evaluate(() => window.musart!.snapshot());
    expect(afterSelect.revision).toBe(initial.revision + 1);
    expect(afterSelect.project.pages[0]!.layers[0]!.effects[0]!.settings!.technique).toBe("lens");
    await expect(page.locator(".effect-gizmo")).toHaveCount(0);
    await page.getByRole("switch", { name: /^(Protect center|Protéger le centre)$/ }).click();
    await expect(page.locator('.effect-gizmo [data-handle="innerRadius"]')).toBeVisible();
    await page.evaluate(() => window.musart!.undo());
    await expect(page.locator(".effect-gizmo")).toHaveCount(0);
    await page.evaluate(() => window.musart!.undo());
    await expect(technique).toHaveText(/^(Gaussian|Gaussien)$/);
    expect(await page.evaluate(() => window.musart!.session().canUndo)).toBe(false);
    expect(d.errors).toEqual([]);
  } finally {
    await d.close();
  }
});
