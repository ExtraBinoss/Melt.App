import { test, expect } from "@playwright/test";
import { installReadbackProbe } from "./support/readback-probe";
test("ASCII exposes custom text, tone and palette controls while keeping real GPU output alive", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("musart.language", "en"));
  await installReadbackProbe(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tools/ascii-converter");
  await expect(page.locator(".tool-converter")).toHaveAttribute("data-ready", "true");
  await page
    .locator("[data-tool-file]")
    .setInputFiles("apps/web/public/benchmark/06-boathouse-1.jpg");
  const download = page.getByRole("button", { name: "Download image", exact: true });
  await expect(download).toBeEnabled({ timeout: 30000 });
  const characters = page.getByRole("textbox", { name: "Characters", exact: true });
  await expect(characters).toHaveValue(" .,:;+tfLCG08M@#");
  await characters.fill(" 01@");
  await characters.press("Escape");
  await expect(characters).toHaveValue(" .,:;+tfLCG08M@#");
  await characters.fill(" 01@");
  await characters.press("Enter");
  await expect(characters).toHaveValue(" 01@");
  await page.getByRole("combobox", { name: "Color mode", exact: true }).click();
  await page.getByRole("option", { name: "Solid ink", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Tonal steps", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Shadow detail", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Ink weight", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Color mode", exact: true }).click();
  await page.getByRole("option", { name: "Gradient ink", exact: true }).click();
  const angle = page.getByRole("textbox", { name: "Gradient angle", exact: true });
  await expect(angle).toHaveValue("0");
  await angle.fill("90");
  await angle.press("Enter");
  await expect(angle).toHaveValue("90");
  await expect(page.getByRole("button", { name: "End color", exact: true })).toBeVisible();
  const pending = page.waitForEvent("download");
  await download.click();
  await (await pending).saveAs("artifacts/ascii-controls/real-ascii.png");
  await page.screenshot({ path: "artifacts/ascii-controls/advanced.png" });
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
  });
  expect(errors).toEqual([]);
});
