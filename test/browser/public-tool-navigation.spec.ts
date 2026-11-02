import { expect, test } from "@playwright/test";

test("Free tools and every converter share the route reveal, native Back links and one document", async ({
  page,
}) => {
  await page.goto("/");
  const marker = await page.evaluate(() => {
    const value = crypto.randomUUID();
    (window as unknown as { publicNavigationMarker: string }).publicNavigationMarker = value;
    return value;
  });
  await page.locator('.site-header nav a[href$="/tools"]').click();
  await expect(page.locator('[data-tool-route="hub"]')).toBeVisible();
  await expect(page.locator(".project-opening-surface")).toHaveCount(0);
  const styles = await page
    .locator(".tool-card")
    .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-style")!));
  expect(styles.length).toBeGreaterThanOrEqual(6);
  for (const style of styles) {
    await page.locator(`.tool-card[data-style="${style}"]`).click();
    await expect(page.locator(`[data-tool-route="${style}"]`)).toBeVisible();
    await expect(page.locator(".project-opening-surface")).toHaveCount(0);
    await page.locator(".tool-back").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-tool-route="hub"]')).toBeVisible();
    await expect(page.locator(".project-opening-surface")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => (window as unknown as { publicNavigationMarker: string }).publicNavigationMarker,
      ),
    ).toBe(marker);
  }
  await page.locator(".tool-back").click();
  await expect(page.locator(".landing-intro .landing-headline")).toHaveAccessibleName(
    "Design that melts social feeds.",
  );
  await expect(page.locator(".project-opening-surface")).toHaveCount(0);
});
