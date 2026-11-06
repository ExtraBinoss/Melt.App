import { expect, test } from "@playwright/test";
import { createPage, createProject } from "@musart/core";

for (const language of ["en", "fr"])
  test(`color-space labels stay readable in a compact inspector (${language})`, async ({
    page,
  }) => {
    await page.addInitScript((language) => {
      localStorage.setItem("musart.language", language);
      localStorage.setItem("musart.editor-tutorial.v1", "done");
      localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    }, language);
    await page.goto("/editor?automation=1");
    await page.waitForFunction(() => !!window.musart);
    await page.evaluate(
      (project) => window.musart!.load(project),
      createProject({ pages: [createPage()] }),
    );
    const trigger = page.locator(".color-mode-select");
    await expect(trigger).toBeVisible();
    // Use the actual panel resize control at its narrow end.
    const handle = (await page.locator(".sidebar-resize").boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 240, handle.y + handle.height / 2, { steps: 4 });
    await page.mouse.up();
    const body = () =>
      page.locator("body").evaluate((node) => ({
        style: node.getAttribute("style"),
        overflow: getComputedStyle(node).overflow,
      }));
    const baseline = await body();
    for (const option of ["sRGB", "Display P3"]) {
      await trigger.click();
      const menu = page.locator('[data-slot="select-content"][data-state="open"]');
      await expect(menu).toBeVisible();
      const widths = await menu.locator(".select-label-text").evaluateAll((labels) =>
        labels.map((label) => ({
          visible: label.clientWidth,
          needed: label.scrollWidth,
        })),
      );
      expect(widths).toHaveLength(3);
      expect(widths.every((width) => width.needed <= width.visible + 1)).toBe(true);
      const box = (await menu.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(280);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(1600);
      expect(await body()).toEqual(baseline);
      await page.getByRole("option", { name: option, exact: true }).click();
      await expect(trigger).toBeFocused();
      const label = trigger.locator(".select-label-text");
      await expect(label).toHaveText(option);
      expect(await label.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    }
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    const menu = page.locator('[data-slot="select-content"][data-state="open"]');
    await expect(menu).toBeVisible();
    await page.keyboard.press("Home");
    await expect(page.getByRole("option", { name: "sRGB", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(trigger).toBeFocused();
    await expect(trigger.locator(".select-label-text")).toHaveText("sRGB");
  });
