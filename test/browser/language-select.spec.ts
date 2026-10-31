import { test, expect } from "@playwright/test";

test("language menus use scroll shadows without arrow rows and retain wheel and keyboard selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.addInitScript(() => localStorage.setItem("musart.language", "en"));
  await page.goto("/tools");
  const trigger = page.locator('.site-languages [role="combobox"]');
  await expect(trigger).toBeEnabled();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const menu = page.locator('[data-slot="select-content"]'),
    viewport = menu.locator('[data-slot="select-viewport"]');
  await expect(menu).toBeVisible();
  await expect(
    menu.locator('[data-slot="select-scroll-up-button"], [data-slot="select-scroll-down-button"]'),
  ).toHaveCount(0);
  const shadow = menu.locator(".scroll-shadow");
  await expect(shadow).toHaveAttribute("data-overflow-bottom", "");
  const box = (await viewport.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 180);
  await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await expect(shadow).toHaveAttribute("data-overflow-top", "");
  await expect
    .poll(() => shadow.evaluate((node) => Number(getComputedStyle(node, "::before").opacity)))
    .toBeGreaterThan(0);
  await page.keyboard.press("End");
  await expect(page.getByRole("option", { name: "العربية", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("option", { name: "English", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Français", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(trigger).toBeFocused();
});

test("tool menus match their field width and guides keep steps and output notes organized", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("musart.language", "en"));
  await page.goto("/tools/ascii-converter");
  await expect(page.locator(".tool-converter")).toHaveAttribute("data-ready", "true");
  await page
    .locator("[data-tool-file]")
    .setInputFiles("apps/web/public/benchmark/06-boathouse-1.jpg");
  await expect(page.getByRole("button", { name: "Download image", exact: true })).toBeEnabled({
    timeout: 30000,
  });
  const trigger = page.getByRole("combobox", { name: "Download format", exact: true });
  const field = (await trigger.boundingBox())!;
  await trigger.click();
  const menu = page.locator('[data-slot="select-content"]');
  await expect
    .poll(async () => Math.abs((await menu.boundingBox())!.width - field.width))
    .toBeLessThan(1);
  await expect.poll(async () => Math.abs((await menu.boundingBox())!.x - field.x)).toBeLessThan(1);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.locator(".tool-guide").scrollIntoViewIfNeeded();
  await expect(page.locator(".tool-steps li")).toHaveCount(3);
  await expect(page.locator(".tool-output-notes > div")).toHaveCount(2);
  await expect(page.locator(".tool-tips li")).toHaveCount(3);
  await page.screenshot({ path: "artifacts/tools/guide-organized.png" });
});
