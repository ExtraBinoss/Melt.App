import fr from "../../apps/web/src/components/onboarding/tutorial/locales/fr.json" with { type: "json" };
import { brand } from "../../apps/web/src/ui/brand/config";
import { expect, test } from "@playwright/test";

for (const width of [1000, 1280]) {
  test(`French effect hover keeps the filtered tutorial surface stable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
    await page.goto("/editor?automation=1");
    await page.getByRole("button", { name: fr.yes }).click({ timeout: 30000 });
    const guide = page.getByRole("region", {
      name: fr.region.replace("{{brandName}}", brand.name),
    });
    await expect(guide.getByRole("heading", { name: fr.steps.canvas.title })).toBeVisible({
      timeout: 30000,
    });
    for (const title of [
      fr.steps.tools.title,
      fr.steps.properties.title,
      fr.steps.layers.title,
      fr.steps.effectMenu.title,
    ]) {
      await guide.getByRole("button", { name: fr.next, exact: true }).click();
      await expect(guide.getByRole("heading", { name: title, exact: true })).toBeVisible();
    }
    await page.locator('.layer-create-actions button[aria-haspopup="menu"]').click();
    await expect(
      guide.getByRole("heading", { name: fr.steps.effectCategory.title, exact: true }),
    ).toBeVisible();
    const category = page.locator('[data-effect-menu-category="effect"]');
    await category.hover();
    await expect(guide.getByRole("heading", { name: fr.steps.dither.title })).toBeVisible();
    const search = page.locator('.effect-catalog[data-effect-category="effect"] input');
    const dither = page.locator('[data-effect-catalog-item="dither"]');
    await expect(search).toHaveValue("dither");
    await expect(dither).toBeVisible();
    await expect
      .poll(async () => {
        const target = await dither.boundingBox(),
          card = await guide.boundingBox(),
          hole = await page.locator(".tutorial-highlight").boundingBox();
        if (!target || !card || !hole) return false;
        const overlap =
          target.x < card.x + card.width &&
          target.x + target.width > card.x &&
          target.y < card.y + card.height &&
          target.y + target.height > card.y;
        return (
          !overlap && Math.abs(hole.x - target.x + 4) < 3 && Math.abs(hole.y - target.y + 4) < 3
        );
      })
      .toBe(true);
    await expect
      .poll(() =>
        guide.evaluate(async (node) => {
          const before = node.getBoundingClientRect();
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
          const after = node.getBoundingClientRect();
          return Math.max(Math.abs(before.x - after.x), Math.abs(before.y - after.y));
        }),
      )
      .toBeLessThan(0.25);
    const before = await guide.boundingBox();
    for (let pass = 0; pass < 5; pass++) {
      await category.hover();
      await page.locator('[data-effect-menu-category="adjustment"]').hover();
      await search.hover();
      await guide.getByRole("heading", { name: fr.steps.dither.title }).hover();
      // Cross the menu's 200ms exit grace while the learner reads the card.
      await page.waitForTimeout(350);
      await expect(search).toHaveValue("dither");
      await expect(dither).toBeVisible();
    }
    const after = await guide.boundingBox();
    expect(Math.abs(after!.x - before!.x)).toBeLessThan(2);
    expect(Math.abs(after!.y - before!.y)).toBeLessThan(2);
    await page.screenshot({ path: `artifacts/tutorial/french-hover-${width}.png` });
    // Guide and outside clicks leave the guided library and its real query intact.
    await guide.getByRole("heading", { name: fr.steps.dither.title }).click();
    await page.mouse.click(4, 400);
    await page.keyboard.press("Escape");
    await expect(search).toBeVisible();
    await category.hover();
    await expect(search).toHaveValue("dither");
    await expect(dither).toBeVisible();
    await dither.click();
    await expect(guide.getByRole("heading", { name: fr.steps.recenter.title })).toBeVisible();
    expect(
      await page.evaluate(
        (lake) =>
          window
            .musart!.snapshot()
            .project.pages[0]!.layers.find((layer) => layer.name === lake)!
            .effects.filter((effect) => effect.type === "dither").length,
        fr.project.lake,
      ),
    ).toBe(1);
  });
}
