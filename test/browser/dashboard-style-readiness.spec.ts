import { expect, test } from "@playwright/test";

test("dashboard styling survives hydration while the studio JavaScript is still pending", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let pending = false;
  await page.route(/\/(?:Studio-[^/]+\.js|src\/bootstrap\/Studio\.tsx)(?:\?|$)/, async (route) => {
    pending = true;
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect.poll(() => pending).toBe(true);
    // The framework retires its development SSR sheet before lazy child modules hydrate.
    await expect(page.locator("link[data-tanstack-router-dev-styles]")).toHaveCount(0);
    const dashboard = page.locator(".project-dashboard");
    await expect(dashboard).toHaveCSS("padding", "0px");
    await expect(dashboard).toHaveCSS("border-radius", "0px");
    expect(await dashboard.evaluate((node) => getComputedStyle(node).gridTemplateColumns)).toMatch(
      /^232px /,
    );
    await expect(page.locator(".template-card-entry").first()).toBeVisible();
    release();
    await expect(dashboard).toHaveCSS("padding", "0px");
  } finally {
    release();
    await page.goto("about:blank");
  }
});
