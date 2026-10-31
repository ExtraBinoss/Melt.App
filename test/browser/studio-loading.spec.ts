import { expect, test } from "@playwright/test";

for (const reduced of [false, true])
  test(`studio module/runtime phases use the shared visible throbber (${reduced ? "reduced motion" : "animated"})`, async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
      reducedMotion: reduced ? "reduce" : "no-preference",
    });
    const page = await context.newPage();
    let releaseStudio: (() => void) | undefined, releaseApp: (() => void) | undefined;
    try {
      await page.addInitScript(() => {
        localStorage.setItem("musart.language", "en");
        localStorage.setItem(
          "musart.onboarding.v1",
          JSON.stringify({ version: 1, completed: true }),
        );
      });
      await page.route("**/src/bootstrap/Studio.tsx*", async (route) => {
        await new Promise<void>((resolve) => {
          releaseStudio = resolve;
        });
        await route.continue();
      });
      await page.route("**/src/App.tsx*", async (route) => {
        await new Promise<void>((resolve) => {
          releaseApp = resolve;
        });
        await route.continue();
      });
      const base = testInfo.project.use.baseURL;
      await page.goto(new URL("/editor?automation=1", base).href, {
        waitUntil: "domcontentloaded",
      });
      const throbber = page.locator('.studio-loading .ui-throbber[data-visible="true"]');
      await expect(throbber).toBeVisible();
      await expect(throbber).toHaveAttribute("data-variant", "shimmer");
      await expect(throbber).toHaveAttribute("role", "status");
      await expect(throbber).toContainText(/Opening your studio|Ouverture de votre atelier/);
      const body = throbber.locator('[data-mascot-part="body"]');
      await expect(body).toHaveAttribute("d", /.+/);
      const first = await body.getAttribute("d");
      if (reduced) {
        await page.waitForTimeout(300);
        expect(await body.getAttribute("d")).toBe(first);
        expect(
          await throbber
            .locator(".ui-throbber-label")
            .evaluate((el) => getComputedStyle(el).animationName),
        ).toBe("none");
      } else await expect.poll(() => body.getAttribute("d")).not.toBe(first);
      releaseStudio?.();
      await expect.poll(() => Boolean(releaseApp)).toBe(true);
      await expect(throbber).toBeVisible();
      await expect(throbber).toHaveAttribute("data-variant", "shimmer");
      await expect(throbber.locator('[data-brand-state="working"]')).toBeVisible();
    } finally {
      releaseStudio?.();
      releaseApp?.();
      await context.close();
    }
  });
