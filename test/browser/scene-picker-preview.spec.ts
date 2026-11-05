import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

declare global {
  interface Window {
    __scenePickers: {
      preview(): string;
      project(): string;
      canUndo(): boolean;
      undo(): void;
      dispose(): void;
    };
  }
}

for (const mode of ["classic", "studio"] as const) {
  test(`${mode} shared scene pickers retain gap previews and native nonmodal focus, cancellation and undo`, async ({
    page,
  }) => {
    await page.route("**/scene-picker-witness", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Scene picker previews</title>",
      }),
    );
    await page.goto("/scene-picker-witness");
    await page.evaluate(
      async ({ url, mode }) => {
        const preamble = "/@react-refresh";
        const refresh = (await import(/* @vite-ignore */ preamble)).default;
        refresh.injectIntoGlobalHook(window);
        Object.assign(window, {
          $RefreshReg$: () => {},
          $RefreshSig$: () => (value: unknown) => value,
          __vite_plugin_react_preamble_installed__: true,
        });
        const witness = (await import(url)) as typeof import("./support/scene-picker-preview");
        await witness.mount(mode);
      },
      { url: `/@fs${resolve("test/browser/support/scene-picker-preview.tsx")}`, mode },
    );
    const body = await page.locator("body").getAttribute("style");
    const original = await page.evaluate(() => window.__scenePickers.project());
    for (const label of ["Material", mode === "studio" ? "Scene" : "Environment"]) {
      const trigger = page.getByRole("button", { name: label, exact: true });
      await trigger.click();
      const popup = page.getByRole("region", { name: label, exact: true });
      await expect(popup.locator(".studio-sphere-properties")).toBeVisible();
      expect(await page.locator("body").getAttribute("style")).toBe(body);
      const tiles = popup.locator("[data-catalog-preset]");
      const first = tiles.nth(0),
        second = tiles.nth(1);
      await expect(first.locator(".studio-catalog-swatch")).toHaveCSS(
        "background-image",
        /spatial\/(materials|environments)\.webp/,
      );
      await first.hover();
      await expect
        .poll(() => page.evaluate(() => window.__scenePickers.preview()))
        .not.toBe("null");
      const draft = await page.evaluate(() => window.__scenePickers.preview());
      const a = (await first.boundingBox())!,
        b = (await second.boundingBox())!;
      await page.mouse.move((a.x + a.width + b.x) / 2, a.y + a.height / 2);
      expect(await page.evaluate(() => window.__scenePickers.preview())).toBe(draft);
      await second.hover();
      await expect.poll(() => page.evaluate(() => window.__scenePickers.preview())).not.toBe(draft);
      const next = await page.evaluate(() => window.__scenePickers.preview());
      const properties = (await popup.locator(".studio-sphere-properties").boundingBox())!;
      await page.mouse.move(properties.x + properties.width / 2, properties.y + 5);
      expect(await page.evaluate(() => window.__scenePickers.preview())).toBe(next);
      expect(await page.evaluate(() => window.__scenePickers.project())).toBe(original);
      expect(await page.evaluate(() => window.__scenePickers.canUndo())).toBe(false);
      await page.keyboard.press("Escape");
      await expect(popup).not.toBeVisible();
      expect(await page.evaluate(() => window.__scenePickers.preview())).toBe("null");
      await expect(trigger).toBeFocused();
      await trigger.click();
      await second.focus();
      await page.keyboard.press("Enter");
      expect(await page.evaluate(() => window.__scenePickers.preview())).toBe("null");
      expect(await page.evaluate(() => window.__scenePickers.project())).not.toBe(original);
      await page.keyboard.press("Escape");
      await page.evaluate(() => window.__scenePickers.undo());
      expect(await page.evaluate(() => window.__scenePickers.project())).toBe(original);
      expect(await page.evaluate(() => window.__scenePickers.canUndo())).toBe(false);
      expect(await page.locator("body").getAttribute("style")).toBe(body);
    }
    await page.evaluate(() => window.__scenePickers.dispose());
  });
}
