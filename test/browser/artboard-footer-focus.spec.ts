import { expect, test } from "@playwright/test";
import { createPage, createProject } from "@musart/core";
import { zoomViewport } from "./support/viewport";

test("artboard footer edges follow zoom and pan, and hidden add controls relinquish native focus", async ({
  page,
}) => {
  const accessibilityWarnings: string[] = [];
  page.on("console", (message) => {
    if (/Blocked aria-hidden|focused.*aria-hidden/i.test(message.text()))
      accessibilityWarnings.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      id: "artboard-footer-focus",
      pages: [createPage({ id: "source", width: 640, height: 400 })],
    }),
  );
  const viewport = page.getByTestId("editor-canvas"),
    artboard = page.getByTestId("artboard"),
    add = page.getByTestId("canvas-add-artboard");
  await expect(artboard).toHaveAttribute("data-artboard-id", "source");
  await expect(artboard).toHaveAttribute("data-view-moving", "false");
  for (const zoom of [1, 0.2, 0.6]) {
    const bounds = (await artboard.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await zoomViewport(page, zoom);
    const pan = await artboard.getAttribute("data-pan-x");
    await page.mouse.wheel(35, -25);
    await expect.poll(() => artboard.getAttribute("data-pan-x")).not.toBe(pan);
    await expect(artboard).toHaveAttribute("data-view-moving", "false");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const board = document.querySelector('[data-testid="artboard"]')!.getBoundingClientRect(),
            mode = document
              .querySelector('.artboard-mode-footer[data-artboard-id="source"]')!
              .getBoundingClientRect(),
            performance = document
              .querySelector('.artboard-performance-footer[data-artboard-id="source"]')!
              .getBoundingClientRect();
          return (
            Math.abs(mode.right - board.right) < 1 &&
            Math.abs(performance.left - board.left) < 1 &&
            Math.abs(mode.top - performance.top) < 1 &&
            mode.top > board.bottom
          );
        }),
      )
      .toBe(true);
  }
  const board = (await artboard.boundingBox())!;
  await page.mouse.move(board.x + board.width + 34, board.y + board.height / 2);
  await expect(add).toHaveAttribute("data-visible", "true");
  await expect(add).not.toHaveAttribute("inert");
  await add.click();
  await expect(viewport).toBeFocused();
  await expect(add).toHaveAttribute("data-visible", "false");
  await expect(add).toHaveAttribute("inert");
  await expect(add).not.toHaveAttribute("aria-hidden");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages.length))
    .toBe(2);
  await expect(artboard).toHaveAttribute("data-view-moving", "false");
  // The consumed action stays outside native tab navigation.
  await page.keyboard.press("Tab");
  await expect(add).not.toBeFocused();
  // Returning to the canvas exposes its keyboard insertion without a pointer hover.
  await viewport.focus();
  await expect(add).toHaveAttribute("data-visible", "true");
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(viewport).toBeFocused();
  await expect(add).toHaveAttribute("inert");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages.length))
    .toBe(3);
  expect(accessibilityWarnings).toEqual([]);
});
