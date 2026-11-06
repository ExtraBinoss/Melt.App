import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
test("Classic effect headings stay compact through filtering and virtual keyboard navigation", async ({
  page,
}) => {
  await page.route("**/__catalog-spacing", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><output></output><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;</script>',
    }),
  );
  await page.goto("/__catalog-spacing");
  await page.evaluate(
    async (path) => {
      const fixture = await import(path);
      await fixture.mountCatalogSpacing();
    },
    `/@fs${resolve("test/browser/support/effect-catalog-spacing.tsx")}`,
  );
  await page.getByRole("button", { name: "Classic effects", exact: true }).click();
  const menu = page.locator('.effect-catalog-menu[data-state="open"]');
  await expect(menu).toBeVisible();
  await menu.hover();
  const metrics = await menu.evaluate((node) => {
    const heading = node
      .querySelector('[data-slot="dropdown-menu-label"]')!
      .getBoundingClientRect();
    const item = node.querySelector("[data-effect-catalog-item]")!.getBoundingClientRect();
    return { heading: heading.height, item: item.height, gap: item.top - heading.bottom };
  });
  expect(metrics).toEqual({ heading: 26, item: 52, gap: 0 });
  await menu.screenshot({ path: "artifacts/classic-effect-spacing/catalog.png" });
  const search = menu.getByRole("searchbox");
  await search.fill("Depth Anything");
  const preview = menu.locator('[data-effect-catalog-item="depth-anything"] .effect-thumbnail');
  await expect(preview).toHaveCSS("background-image", /depth-anything-v3-/);
  const size = await preview.evaluate(async (node) => {
    const image = new Image();
    image.src = getComputedStyle(node).backgroundImage.slice(5, -2);
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  });
  expect(size).toEqual([240, 180]);
  await search.fill("");
  await search.focus();
  await search.press("ArrowDown");
  await expect(menu.locator("[data-effect-catalog-item]:focus")).toHaveCount(1);
  await page.keyboard.press("End");
  await expect
    .poll(() =>
      menu
        .locator("[data-effect-catalog-item]:focus")
        .evaluate(
          (node) => node.getAttribute("aria-posinset") === node.getAttribute("aria-setsize"),
        ),
    )
    .toBe(true);
  await page.keyboard.press("Home");
  await expect(menu.locator("[data-effect-catalog-item]:focus")).toHaveAttribute(
    "aria-posinset",
    "1",
  );
  await search.fill("Risograph");
  await expect(menu.locator("[data-effect-catalog-item]")).toHaveCount(1);
  await expect
    .poll(() => menu.locator(".effect-catalog-viewport").evaluate((node) => node.clientHeight))
    .toBe(86);
  await search.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(page.locator("output")).toHaveText("risograph");
});
