import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Project } from "@musart/core";

test("Studio slider pill follows a held pointer and resets despite retained focus", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  await page.goto("/editor?automation=1&workspace=studio");
  await page.waitForFunction(() => !!window.musart);
  const { project } = JSON.parse(
    await readFile("apps/web/public/templates/designed/studio-starter/studio-starter.json", "utf8"),
  ) as { project: Project };
  await page.evaluate((value) => {
    window.musart!.load(value);
    window.musart!.select(["studio-title"]);
  }, project);
  const thumb = page.locator(".studio-object-bar").getByRole("slider", { name: "Depth", exact: true });
  await expect(thumb).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(thumb).toHaveCSS("opacity", "0.25");
  await expect(thumb).toHaveCSS("scale", "0.5 0.583333");
  const bounds = (await thumb.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(thumb).toHaveCSS("opacity", "0.65");
  await page.mouse.down();
  await expect(thumb).toBeFocused();
  await expect(thumb).toHaveCSS("opacity", "1");
  await expect(thumb).toHaveCSS("scale", "1");
  await page.mouse.up();
  await expect(thumb).toHaveCSS("opacity", "0.65");
  await page.mouse.move(0, 0);
  await expect(thumb).toBeFocused();
  await expect(thumb).toHaveCSS("opacity", "0.25");
  await expect(thumb).toHaveCSS("scale", "0.5 0.583333");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(thumb).toBeFocused();
  expect(await thumb.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await expect(thumb).toHaveCSS("outline-width", "1px");
  await expect(thumb).toHaveCSS("opacity", "0.25");
  await expect(thumb).toHaveCSS("scale", "0.5 0.583333");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(thumb).toHaveCSS("transition-duration", "0s");
});
