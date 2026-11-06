import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Project } from "@musart/core";

test("Studio slider pill follows a held pointer and resets despite retained focus", async ({
  page,
}) => {
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
  const thumb = page
    .locator(".studio-object-bar")
    .getByRole("slider", { name: "Depth", exact: true });
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

test("resetting Studio extrusion depth produces one undoable default-value edit", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1&workspace=studio");
  await page.waitForFunction(() => !!window.musart);
  const { project } = JSON.parse(
    await readFile("apps/web/public/templates/designed/studio-starter/studio-starter.json", "utf8"),
  ) as { project: Project };
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["studio-title"]);
  }, project);
  const slider = page
    .locator(".studio-object-bar")
    .getByRole("slider", { name: "Depth", exact: true });
  await expect(slider).toBeVisible();
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow", "0.31");
  const before = await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project));
  const root = slider.locator(
    'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " studio-slider ")][1]',
  );
  const box = (await root.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width * 0.8, box.y + box.height / 2, { delay: 100 });
  await expect(slider).toHaveAttribute("aria-valuenow", "0.3");
  const feedback = root.locator(".studio-slider-reset-feedback");
  await expect(feedback).toHaveAttribute("data-resetting", "");
  await expect(feedback).not.toHaveAttribute("data-resetting");
  await page.evaluate(() => window.musart!.undo());
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(before);
  await expect(slider).toHaveAttribute("aria-valuenow", "0.31");
  await page.evaluate(() => window.musart!.redo());
  await expect(slider).toHaveAttribute("aria-valuenow", "0.3");
});
