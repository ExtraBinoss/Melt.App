import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createProject, createPage, createLayer } from "@musart/core";

for (const mobile of [false, true]) {
  test.describe(mobile ? "touch" : "desktop", () => {
    let context: BrowserContext;
    let page: Page;
    test.beforeAll(async ({ browser }, testInfo) => {
      context = await browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        viewport: mobile ? { width: 390, height: 844 } : { width: 1600, height: 1000 },
        hasTouch: mobile,
      });
      page = await context.newPage();
      await page.addInitScript(() => {
        localStorage.setItem("musart.language", "en");
        localStorage.setItem("musart.editor-tutorial.v1", "done");
      });
      await page.goto("/editor?automation=1&workspace=studio");
      await page.waitForFunction(() => !!window.musart);
    });
    test.afterAll(async () => {
      await context?.close();
    });
    test(`Studio shares the Motion dock, pin reservation and transport (${mobile ? "touch" : "desktop"})`, async () => {
      const project = createProject({
        pages: [
          createPage({
            width: 320,
            height: 240,
            layers: [
              createLayer("rectangle", { id: "subject", width: 100, height: 100, fill: "#8757ff" }),
            ],
          }),
        ],
      });
      await page.evaluate((document) => {
        window.musart!.load(document);
        window.musart!.select(["subject"]);
      }, project);
      await page.locator(".studio-compositions button").first().click();
      await page.getByRole("radio", { name: "Motion", exact: true }).click();
      await page.keyboard.press("Escape");
      const dock = page.locator(".motion-timeline-dock");
      await expect(dock).toHaveCount(1);
      await expect(dock).toHaveAttribute("data-motion-pinned", "true");
      await expect(dock).not.toHaveAttribute("data-motion-animating");
      await page.locator('.editor-gpu-scene canvas[data-renderer-ready="true"]').waitFor();
      const panel = await page.locator(".motion-timeline").elementHandle();
      const documentBefore = await page.evaluate(() =>
        JSON.stringify(window.musart!.snapshot().project),
      );
      await page.getByRole("button", { name: "Play", exact: true }).click();
      await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      const ruler = page.getByRole("slider", { name: "Seek in timeline", exact: true });
      await ruler.focus();
      await page.keyboard.press("ArrowRight");
      await page.getByRole("button", { name: "Unpin timeline", exact: true }).click();
      await page.mouse.move(200, 150);
      await expect(dock).toHaveAttribute("data-motion-pinned", "false");
      await expect(dock).toHaveAttribute("data-motion-expanded", "false");
      await expect(dock).not.toHaveAttribute("data-motion-animating");
      const clearance = await page.locator(".studio-material").evaluate((node) => {
        const bottom = node.getBoundingClientRect().bottom;
        const top = document.querySelector(".motion-timeline")!.getBoundingClientRect().top;
        return top - bottom;
      });
      expect(clearance).toBeGreaterThanOrEqual(10);
      const toggle = page.locator(".canvas-timeline-toggle");
      await expect(toggle).toBeVisible();
      if (mobile) await toggle.tap();
      else await toggle.click();
      await expect(dock).toHaveAttribute("data-motion-expanded", "true");
      await page.getByRole("button", { name: "Pin timeline", exact: true }).click();
      await expect(dock).not.toHaveAttribute("data-motion-animating");
      const bounds = await page.locator(".canvas-area").boundingBox();
      const timeline = await page.locator(".motion-timeline").boundingBox();
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(timeline!.y + 1);
      expect(
        await panel!.evaluate((node) => node === document.querySelector(".motion-timeline")),
      ).toBe(true);
      if (!mobile) {
        for (const mode of ["Classic", "Studio"]) {
          await page.getByRole("button", { name: "Project actions", exact: true }).click();
          await page.getByRole("combobox", { name: "Workspace", exact: true }).click();
          await page.getByRole("option", { name: mode, exact: true }).click();
          await page.keyboard.press("Escape");
          await expect(page.locator(".workspace-mode-root")).toHaveAttribute(
            "data-workspace-mode",
            mode.toLowerCase(),
          );
          expect(
            await panel!.evaluate((node) => node === document.querySelector(".motion-timeline")),
          ).toBe(true);
          await expect(dock).toHaveAttribute("data-motion-pinned", "true");
        }
      }
      expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(
        documentBefore,
      );
      await page.screenshot({
        path: `artifacts/studio/sdk-timeline-${mobile ? "mobile" : "desktop"}.png`,
      });
    });
  });
}
