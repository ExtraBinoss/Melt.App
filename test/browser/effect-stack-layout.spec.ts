import { expect, test } from "@playwright/test";

test("both workspaces share collapsible effects with nonmodal actions and atomic undo", async ({
  page,
}) => {
  for (const workspace of ["classic", "studio"] as const) {
    await page.route("**/effect-stack-witness*", (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" }),
    );
    await page.goto("/effect-stack-witness");
    await page.evaluate(
      async ({ root, workspace }) => {
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
        ).mountEffectMotionLayout("en", workspace, true);
      },
      { root: process.cwd(), workspace },
    );
    if (workspace === "studio") {
      await page.getByRole("button", { name: "Add effect", exact: true }).click();
      await page.getByRole("button", { name: "Stack (2)", exact: true }).click();
    }
    const stack = page.locator(".effect-stack");
    const card = stack.locator(".effect-stack-card").first();
    const title = card.locator('.effect-stack-heading [data-slot="accordion-trigger"]');
    await expect(title).toHaveAttribute("aria-expanded", "false");
    const before = await page.evaluate(() =>
      JSON.stringify(window.__effectStack!.getSnapshot().project),
    );
    await title.click();
    await expect(title).toHaveAttribute("aria-expanded", "true");
    await expect(
      stack.locator('.effect-stack-card > [data-slot="accordion-content"][data-state="open"]'),
    ).toHaveCount(1);
    await card.getByRole("button", { name: "Position & area", exact: true }).click();
    await expect(card.locator(".effect-position-pad > button")).toBeVisible();
    await expect(card.locator("details, summary")).toHaveCount(0);
    await title.click();
    await expect(title).toHaveAttribute("aria-expanded", "false");
    expect(
      await page.evaluate(() => JSON.stringify(window.__effectStack!.getSnapshot().project)),
    ).toBe(before);
    const actions = card.getByRole("button", { name: / · Actions$/ });
    await actions.click();
    await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
    await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
    const remove = page.getByRole("menuitem", { name: "Remove effect", exact: true });
    const bounds = (await remove.boundingBox())!;
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, {
      button: "right",
    });
    expect(
      await page.evaluate(
        () => window.__effectStack!.getSnapshot().project.pages[0]!.layers[0]!.effects.length,
      ),
    ).toBe(2);
    await page.keyboard.press("Escape");
    await actions.click();
    const move = page.getByRole("menuitem", { name: "Move effect down", exact: true });
    await move.focus();
    await page.keyboard.press("Enter");
    expect(
      await page.evaluate(
        () => window.__effectStack!.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.type,
      ),
    ).toBe("grain");
    await page.evaluate(() => window.__effectStack!.undo());
    expect(
      await page.evaluate(() => JSON.stringify(window.__effectStack!.getSnapshot().project)),
    ).toBe(before);
    expect(await page.evaluate(() => window.__effectStack!.getSnapshot().canUndo)).toBe(false);
    await page.screenshot({ path: `artifacts/studio/effect-accordion-${workspace}.png` });
  }
});
