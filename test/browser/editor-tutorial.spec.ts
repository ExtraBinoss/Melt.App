import { expect, test } from "@playwright/test";

test("guided editor practice, automatic tasks, exit and editor-only replay", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("musart.language", "en"));
  await page.goto("/editor");
  await expect(
    page.getByRole("heading", { name: "Do you want to start a quick tutorial?" }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Yes, start tutorial" }).click();
  const guide = page.getByRole("region", { name: "Melt tutorial" });
  await expect(guide.getByRole("heading", { name: "Your canvas" })).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".tutorial-highlight")).toBeVisible();
  await expect(guide.locator("svg.melt-mascot")).toHaveCount(1);
  await expect(guide.locator("img")).toHaveCount(0);
  await expect
    .poll(async () => {
      const box = await guide.boundingBox();
      const viewport = page.viewportSize()!;
      return box
        ? Math.max(
            Math.abs(box.x + box.width / 2 - viewport.width / 2),
            Math.abs(box.y + box.height / 2 - viewport.height / 2),
          )
        : 999;
    })
    .toBeLessThan(3);
  expect(
    await page.locator(".tutorial-highlight").evaluate((node) => getComputedStyle(node).boxShadow),
  ).toContain("0.72");
  for (const title of ["Your tools", "Properties", "Layers"]) {
    await guide.getByRole("button", { name: "Next", exact: true }).click();
    await expect(guide.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  await guide.getByRole("button", { name: "Previous" }).click();
  await expect(guide.getByRole("heading", { name: "Properties", exact: true })).toBeVisible();
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  await expect(guide.getByRole("heading", { name: "Layers", exact: true })).toBeVisible();
  for (const title of [
    "Add an effect",
    "Try dither",
    "Make it move",
    "Pin the timeline",
    "Add a pop",
    "Play",
    "Export",
    "Save your video",
  ]) {
    if (title === "Make it move")
      await page.locator('[data-effect-catalog-item="bit-dither"]').click();
    else if (title === "Play") await page.locator('[data-preset-id="scale-pop"]').click();
    else await guide.getByRole("button", { name: "Next", exact: true }).click();
    await expect(guide.getByRole("heading", { name: title, exact: true })).toBeVisible();
    if (title === "Try dither")
      await expect(page.locator('.effect-catalog[data-effect-category="effect"]')).toBeVisible();
    if (title === "Try dither") {
      await page.locator('.effect-catalog[data-effect-category="effect"] input').fill("dither");
      await expect(page.locator('[data-effect-catalog-item="bit-dither"]')).toBeVisible();
      await page.screenshot({ path: "artifacts/tutorial/dither-guide.png" });
    }
    if (title === "Add a pop") await expect(page.locator(".animation-picker")).toBeVisible();
  }
  await expect(page.locator(".motion-export-preview-surface")).toBeVisible();
  await expect
    .poll(async () => {
      const highlight = await page.locator(".tutorial-highlight").boundingBox();
      const target = await page.locator(".export-submit").boundingBox();
      if (!highlight || !target) return 999;
      return Math.max(Math.abs(highlight.x - target.x + 4), Math.abs(highlight.y - target.y + 4));
    })
    .toBeLessThan(3);
  await page.screenshot({ path: "artifacts/tutorial/export-guide.png" });
  const downloading = page.waitForEvent("download");
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/\.(mp4|webm)$/);
  await download.saveAs("artifacts/tutorial/practice-video.mp4");
  await expect(guide.getByRole("heading", { name: "You're ready" })).toBeVisible({
    timeout: 30000,
  });
  await guide.getByRole("button", { name: "Exit tutorial" }).click();
  await expect(page.getByRole("heading", { name: "Leave the tutorial?" })).toBeVisible();
  await page.getByRole("button", { name: "Keep going" }).click();
  await expect(guide).toBeVisible();
  await guide.getByRole("button", { name: "Exit tutorial" }).click();
  await page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "Leave the tutorial?" }) })
    .getByRole("button", { name: "Exit tutorial" })
    .click();
  await expect(guide).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("musart.editor-tutorial.v1"))).toBe("done");
  await page.locator('.export-dialog [data-slot="dialog-close"]').click();
  await expect(page.locator(".export-dialog")).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("Editor settings");
  await page.getByRole("option").filter({ hasText: "Editor settings" }).click();
  await page.getByRole("button", { name: "Replay onboarding" }).click();
  await expect(
    page.getByRole("heading", { name: "Do you want to start a quick tutorial?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "No, thanks" }).click();
  await expect(guide).toHaveCount(0);
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Replay onboarding" })).toHaveCount(0);
});
