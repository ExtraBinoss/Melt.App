import { expect, test } from "@playwright/test";

for (const language of ["fr", "en"] as const) {
  test(`closing headline replays green glyph contours on hover without an entrance (${language})`, async ({
    page,
    context,
    baseURL,
  }, info) => {
    await page.emulateMedia({ colorScheme: "light" });
    await context.addCookies([{ name: "musart.language", value: language, url: baseURL! }]);
    await page.goto("/");
    const footer = page.locator(".landing-footer");
    const stage = footer.locator(".hero-type-stage");
    const heading = footer.getByRole("heading", {
      level: 2,
      name: language === "fr" ? "À vous de jouer." : "Your turn.",
    });
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(stage).not.toHaveAttribute("data-vector-ready");
    await footer.scrollIntoViewIfNeeded();
    await expect(heading).toBeVisible();
    await expect(stage).not.toHaveAttribute("data-ink-pending");
    await expect(stage).not.toHaveAttribute("data-ink-auto");
    await expect(stage).toHaveAttribute("data-vector-ready");
    const target = await heading.locator(".hero-chunk").evaluate((node) => {
      const range = document.createRange();
      range.setStart(node.firstChild!, 2);
      range.setEnd(node.firstChild!, 3);
      const rect = range.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    for (let repeat = 0; repeat < 2; repeat++) {
      await page.emulateMedia({ colorScheme: repeat ? "dark" : "light" });
      await page.mouse.move(target.x + repeat, target.y);
      await expect(stage).toHaveAttribute("data-ink-active");
      const path = stage.locator('.hero-glyph-overlay > g[opacity="1"] > path').first();
      await expect(path).toHaveAttribute("fill-opacity", "0");
      await expect(path).toHaveCSS("color", repeat ? "rgb(12, 193, 71)" : "rgb(13, 163, 63)");
      expect(
        await stage.locator('.hero-glyph-overlay circle[opacity="1"]').count(),
      ).toBeGreaterThan(0);
      if (!repeat)
        await footer.screenshot({
          path: info.outputPath(`footer-hover-${language}.png`),
          animations: "allow",
        });
      await expect(stage).not.toHaveAttribute("data-ink-active");
    }
    await expect(footer.locator(".landing-cta")).toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.mouse.move(target.x, target.y);
    await expect(stage).not.toHaveAttribute("data-ink-active");
    await expect(heading).toBeVisible();
    await expect(heading.locator(".hero-chunk")).not.toHaveCSS("color", "rgba(0, 0, 0, 0)");
  });
}
