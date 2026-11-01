import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

test("descriptions, automatic project/template tags and empty creation work on desktop and phone", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mkdir("artifacts/library-contents", { recursive: true });
  await writeFile(
    "artifacts/library-contents/library.html",
    `<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true; const { mountLibraryContentsWitness } = await import("/@fs${resolve("test/browser/support/library-contents.tsx")}"); await mountLibraryContentsWitness();</script></body></html>`,
  );
  await page.goto(`/@fs${resolve("artifacts/library-contents/library.html")}`);
  const create = page.locator(".empty-project-create");
  await expect(create).toBeVisible({ timeout: 20000 });
  expect((await create.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await create.click();
  await expect(page.locator(".creation-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".creation-dialog")).toHaveCount(0);
  await page.evaluate(() => window.libraryContentsWitness!.seed());
  const project = page.getByRole("article", { name: "Detected project", exact: true });
  await expect(project.locator('[data-content-tag="effect:blur"]')).toHaveText("Blur");
  await project.locator(".project-preview-open").click();
  const detail = page.locator(".library-item-dialog");
  await expect(detail).toHaveAccessibleDescription(
    "Your saved project, ready to continue editing.",
  );
  await expect(detail.locator('[data-content-tag="effect:blur"]')).toHaveText("Blur");
  await page.keyboard.press("Escape");
  await page.locator(".library-navigation-item").filter({ hasText: "Templates" }).click();
  const terminal = page.getByRole("article", { name: "Terminal Signal", exact: true });
  await expect(terminal.locator(".library-card-description")).toContainText("green terminal");
  await terminal.locator(".project-preview-open").click();
  await expect(detail).toHaveAccessibleDescription(/green terminal/);
  await expect(detail.locator('[data-content-tag="effect:terminal"]')).toBeVisible();
  await expect(detail.locator('[data-content-tag="effect:crt"]')).toBeVisible();
  await page.screenshot({ path: "artifacts/library-contents/desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(detail).toBeVisible();
  const bounds = (await detail.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(await detail.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/library-contents/phone.png" });
  expect(errors).toEqual([]);
  await page.evaluate(() => window.libraryContentsWitness!.dispose());
});
