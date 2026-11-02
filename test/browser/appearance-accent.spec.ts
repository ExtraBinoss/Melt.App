import { expect, test, type Page } from "@playwright/test";

async function appearance(page: Page) {
  await expect(page.locator(".library-recents > p.library-sidebar-status")).toBeVisible();
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Preferences", exact: true });
  await dialog.getByRole("tab", { name: "Appearance", exact: true }).click();
  return dialog;
}

test("accent previews cancel locally, keyboard commits persist across themes and editor navigation", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/dashboard");
  const dialog = await appearance(page);
  const select = dialog.getByRole("combobox", { name: "Accent color", exact: true });
  const preview = dialog.locator("[data-accent-preview]");
  const bodyStyle = await page.locator("body").getAttribute("style");
  const original = await page.locator("html").getAttribute("style");
  await select.click();
  await page.getByRole("option", { name: "Green", exact: true }).hover();
  await expect(preview).toHaveAttribute("data-accent-preview", "green");
  expect(await page.locator("html").getAttribute("style")).toBe(original);
  expect(await page.locator("body").getAttribute("style")).toBe(bodyStyle);
  await page.getByRole("option", { name: "Green", exact: true }).click({ button: "right" });
  await expect(page.locator("html")).toHaveAttribute("data-accent", "violet");
  await page.keyboard.press("Escape");
  await expect(preview).toHaveAttribute("data-accent-preview", "violet");
  await expect(dialog).toBeVisible();
  await expect(select).toBeFocused();
  await select.press("Space");
  await page.keyboard.press("ArrowDown");
  await expect(preview).toHaveAttribute("data-accent-preview", "green");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "violet");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "green");
  expect(await page.evaluate(() => localStorage.getItem("musart.accent.v1"))).toBe("green");
  await dialog.getByRole("radio", { name: "Dark", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
      ),
    )
    .toBe("#0CC147");
  await dialog.screenshot({ path: info.outputPath("appearance-green-dark.png") });
  await dialog.getByRole("tab", { name: "General", exact: true }).click();
  const clipboard = dialog.getByRole("switch", {
    name: "Include images when copying",
    exact: true,
  });
  await expect(clipboard).toBeChecked();
  await expect(clipboard.locator('[data-slot="switch-thumb"]')).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await dialog.getByRole("tab", { name: "Appearance", exact: true }).click();
  await dialog.getByRole("radio", { name: "Light", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
      ),
    )
    .toBe("#087C30");
  await dialog.screenshot({ path: info.outputPath("appearance-green-light.png") });
  await page.setViewportSize({ width: 460, height: 740 });
  await expect
    .poll(() =>
      dialog
        .locator(".preferences-page-viewport")
        .evaluate((node) => node.scrollWidth - node.clientWidth),
    )
    .toBeLessThanOrEqual(1);
  await dialog.screenshot({ path: info.outputPath("appearance-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "green");
  const restored = await appearance(page);
  await expect(restored.getByRole("combobox", { name: "Accent color", exact: true })).toHaveText(
    "Green",
  );
  await page.goto("/editor?automation=1");
  await expect(page.locator('canvas[data-renderer-ready="true"]')).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "green");
});

test("live appearance settings translate palette names and previews in Arabic", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("musart.language", "ar"));
  await page.goto("/dashboard");
  await expect(page.locator(".library-recents > p.library-sidebar-status")).toBeVisible();
  await page.locator(".library-preferences").click();
  const dialog = page.locator(".preferences-dialog");
  await dialog.getByRole("tab", { name: "المظهر", exact: true }).click();
  await dialog.getByRole("combobox", { name: "لون التمييز", exact: true }).click();
  await page.getByRole("option", { name: "فيروزي", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "teal");
  await expect(
    dialog.getByRole("group", { name: "معاينة لون التمييز", exact: true }),
  ).toBeVisible();
  await dialog.screenshot({ path: info.outputPath("appearance-arabic.png") });
});
