import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("dashboard styling survives hydration while the studio JavaScript is still pending", async ({
  page,
}, info) => {
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
    const actions = page.locator(".dashboard-create-group");
    await actions.screenshot({ path: info.outputPath("pending-creation-action.png") });
    await expect(actions).toHaveCSS("display", "flex", { timeout: 1500 });
    await expect(actions).toHaveCSS("gap", "1px");
    const primary = actions.locator("button").first(),
      options = actions.locator("button").last();
    await expect(primary).toHaveCSS("height", "40px");
    await expect(primary).toHaveCSS("border-start-end-radius", "0px");
    await expect(primary).toHaveCSS("border-start-start-radius", "6px");
    await expect(options).toHaveCSS("height", "40px");
    await expect(options).toHaveCSS("width", "34px");
    await expect(options).toHaveCSS("border-start-start-radius", "0px");
    await expect(options).toHaveCSS("border-start-end-radius", "6px");
    release();
    // A completed real sidebar read establishes hydration before testing menu input.
    await expect(
      page
        .locator(".library-recents")
        .getByText("Your next projects will appear here.", { exact: true }),
    ).toBeVisible();
    await expect(dashboard).toHaveCSS("padding", "0px");
    const geometry = await actions.evaluate((node) =>
      [node, ...node.querySelectorAll("button")].map((element) => {
        const style = getComputedStyle(element);
        return {
          display: style.display,
          height: style.height,
          gap: style.gap,
          width: style.width,
          radius: style.borderRadius,
        };
      }),
    );
    // Opening the export workspace later must not restyle the creation action.
    await page.addStyleTag({
      content: await readFile("apps/web/src/components/export/export.css", "utf8"),
    });
    expect(
      await actions.evaluate((node) =>
        [node, ...node.querySelectorAll("button")].map((element) => {
          const style = getComputedStyle(element);
          return {
            display: style.display,
            height: style.height,
            gap: style.gap,
            width: style.width,
            radius: style.borderRadius,
          };
        }),
      ),
    ).toEqual(geometry);
    await options.click();
    await expect(page.getByRole("menuitem", { name: "Import .musart", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(options).toBeFocused();
    await primary.click();
    await expect(page.locator(".creation-dialog")).toBeVisible();
  } finally {
    release();
    await page.goto("about:blank");
  }
});
