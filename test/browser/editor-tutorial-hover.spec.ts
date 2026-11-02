import { expect, test } from "@playwright/test";

for (const width of [1000, 1280]) {
  test(`French effect hover keeps the filtered tutorial surface stable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
    await page.goto("/editor?automation=1");
    await page.getByRole("button", { name: "Yes, start tutorial" }).click({ timeout: 30000 });
    const guide = page.getByRole("region", { name: "Melt tutorial" });
    await expect(guide.getByRole("heading", { name: "Your canvas" })).toBeVisible({
      timeout: 30000,
    });
    for (const title of ["Your tools", "Properties", "Layers", "Open the effect menu"]) {
      await guide.getByRole("button", { name: "Next", exact: true }).click();
      await expect(guide.getByRole("heading", { name: title, exact: true })).toBeVisible();
    }
    await page.locator('.layer-create-actions button[aria-haspopup="menu"]').click();
    await expect(guide.getByRole("heading", { name: "Add an effect", exact: true })).toBeVisible();
    const category = page.locator('[data-effect-menu-category="effect"]');
    await category.hover();
    await expect(guide.getByRole("heading", { name: "Try Dither" })).toBeVisible();
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
      await guide.getByRole("heading", { name: "Try Dither" }).hover();
      // Cross the menu's 200ms exit grace while the learner reads the card.
      await page.waitForTimeout(350);
      await expect(search).toHaveValue("dither");
      await expect(dither).toBeVisible();
    }
    const after = await guide.boundingBox();
    expect(Math.abs(after!.x - before!.x)).toBeLessThan(2);
    expect(Math.abs(after!.y - before!.y)).toBeLessThan(2);
    await page.screenshot({ path: `artifacts/tutorial/french-hover-${width}.png` });
    // A deliberate outside click can close the menu; reopening must keep its real query.
    await guide.getByRole("heading", { name: "Try Dither" }).click();
    await expect(search).toBeHidden();
    await page.locator('.layer-create-actions button[aria-haspopup="menu"]').click();
    await category.hover();
    await expect(search).toHaveValue("dither");
    await expect(dither).toBeVisible();
    await dither.click();
    await expect(guide.getByRole("heading", { name: "Back to your canvas" })).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          window
            .musart!.snapshot()
            .project.pages[0]!.layers.find((layer) => layer.name === "Lake")!
            .effects.filter((effect) => effect.type === "dither").length,
      ),
    ).toBe(1);
  });
}
