import { test, expect } from "@playwright/test";

for (const media of ["Image", "Video"])
  test(`sample chooser opens a real ${media.toLowerCase()} and keeps dimensions inside download`, async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("musart.language", "en"));
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/tools/ascii-converter");
    const sample = page.getByRole("button", { name: "Try a sample", exact: true });
    await expect(sample).toBeEnabled();
    const body = await page.locator("body").getAttribute("style");
    await sample.click();
    const image = page.getByRole("menuitem", { name: "Image", exact: true });
    await expect(image).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Video", exact: true })).toBeVisible();
    expect(await page.locator("body").getAttribute("style")).toBe(body);
    const item = page.getByRole("menuitem", { name: media, exact: true });
    await item.click({ button: "right" });
    await expect(item).toBeVisible();
    await expect(page.locator(".tool-file-name")).toHaveCount(0);
    await item.click();
    const download = page.getByRole("button", {
      name: `Download ${media.toLowerCase()}`,
      exact: true,
    });
    await expect(download).toBeEnabled({ timeout: 30000 });
    await expect(download.locator(".tool-download-size")).toContainText(/\d+ × \d+ px/);
    await expect(page.locator(".tool-output-controls .tool-output-size")).toHaveCount(0);
    await expect(page.locator("canvas[data-tool-renderer]")).toBeVisible();
    if (media === "Video")
      await expect(page.getByRole("button", { name: "Pause preview", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
