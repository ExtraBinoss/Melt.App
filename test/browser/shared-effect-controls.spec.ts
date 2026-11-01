import { expect, test } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";

test("editor Dither has all shared methods and ASCII gradient controls commit and undo", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  for (const type of ["dither", "ascii"] as const) {
    await page.evaluate(
      (project) => window.musart!.load(project),
      createProject({
        pages: [
          createPage({
            width: 320,
            height: 240,
            layers: [
              createLayer("rectangle", { width: 200, height: 120, effects: [createEffect(type)] }),
            ],
          }),
        ],
      }),
    );
    await page.locator('button[data-attachment-target="effect"]').first().click();
    const panel = page.locator('.layer-attachment-popover[data-state="open"]');
    await expect(panel.locator("[data-attachment-ready]")).toBeVisible();
    if (type === "dither") {
      await expect(panel.getByRole("textbox", { name: "Levels", exact: true })).toBeVisible();
      await panel.getByRole("combobox", { name: "Method", exact: true }).click();
      for (const name of [
        "Multilevel Bayer",
        "Fixed threshold",
        "Bayer 2×2",
        "Bayer 4×4",
        "Bayer 8×8",
        "Interleaved gradient noise",
      ])
        await expect(page.getByRole("option", { name, exact: true })).toBeVisible();
      await page.getByRole("option", { name: "Bayer 8×8", exact: true }).click();
      await expect(panel.getByRole("textbox", { name: "Levels", exact: true })).toHaveCount(0);
      await expect(panel.getByRole("textbox", { name: "Tone gamma", exact: true })).toBeVisible();
      const colors = panel.getByRole("switch", { name: "Source colors", exact: true });
      await colors.click();
      await expect(panel.getByRole("button", { name: "Ink color", exact: true })).toHaveCount(0);
      await page.evaluate(() => window.musart!.undo());
      await expect(colors).not.toBeChecked();
    } else {
      await panel.getByRole("combobox", { name: "Color mode", exact: true }).click();
      await page.getByRole("option", { name: "Gradient ink", exact: true }).click();
      const angle = panel.getByRole("textbox", { name: "Gradient angle", exact: true });
      await angle.fill("90");
      await angle.press("Enter");
      await expect(angle).toHaveValue("90");
      await expect(panel.getByRole("button", { name: "End color", exact: true })).toBeVisible();
      await page.evaluate(() => window.musart!.undo());
      await expect(angle).toHaveValue("0");
    }
    await page.keyboard.press("Escape");
    await expect(page.locator(".layer-attachment-popover")).toHaveCount(0);
  }
});
