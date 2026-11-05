import { expect, test } from "@playwright/test";

test("Motion text and complete parameter names stay readable on desktop and narrow screens", async ({
  page,
}) => {
  for (const entry of [
    {
      language: "en",
      workspace: "classic",
      width: 1100,
      settings: "Settings",
      property: "Animated property",
    },
    {
      language: "fr",
      workspace: "studio",
      width: 360,
      settings: "Réglages",
      property: "Propriété animée",
    },
  ] as const) {
    await page.setViewportSize({ width: entry.width, height: 850 });
    await page.route("**/motion-layout-witness*", (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" }),
    );
    await page.goto("/motion-layout-witness");
    await page.evaluate(
      async ({ root, language, workspace }) => {
        const preamble = "/@react-refresh";
        const refresh = (await import(/* @vite-ignore */ preamble)).default;
        refresh.injectIntoGlobalHook(window);
        Object.assign(window, {
          $RefreshReg$: () => {},
          $RefreshSig$: () => (value: unknown) => value,
          __vite_plugin_react_preamble_installed__: true,
        });
        const fixture = "/@fs" + root + "/test/browser/support/effect-motion-layout.tsx";
        await (
          await import(/* @vite-ignore */ fixture)
        ).mountEffectMotionLayout(language, workspace);
      },
      { root: process.cwd(), ...entry },
    );
    await page.getByRole("button", { name: "Motion", exact: true }).click();
    const panel = page.locator(".effect-motion");
    await expect(panel).toBeVisible();
    const tile = panel.locator(".effect-motion-choice").first();
    expect(
      await tile.evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
    ).toBeGreaterThanOrEqual(14);
    await panel.getByRole("button", { name: entry.settings, exact: true }).click();
    const field = panel.getByRole("combobox", { name: entry.property, exact: true });
    const parentWidth = await field.evaluate(
      (node) => node.parentElement!.getBoundingClientRect().width,
    );
    expect((await field.boundingBox())!.width).toBeGreaterThan(parentWidth * 0.95);
    await field.click();
    const menu = page.getByRole("listbox", { name: entry.property, exact: true });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("option", { selected: true })).toBeFocused();
    expect(
      await menu
        .locator(".select-label-text")
        .evaluateAll((nodes) => nodes.every((node) => node.scrollWidth <= node.clientWidth + 1)),
    ).toBe(true);
    const bounds = (await menu.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(entry.width);
    await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
    await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
    await page.screenshot({ path: `artifacts/studio/motion-readable-${entry.language}.png` });
    await page.keyboard.press("Escape");
    await expect(field).toBeFocused();
  }
});
