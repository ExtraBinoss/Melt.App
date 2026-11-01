import { expect, test } from "@playwright/test";
import type { AutomationApi } from "../../apps/web/src/services/automation/automation";

test("Angel playback retains local select sizing, native choice and inspector focus", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(async () => {
    const manifest = await fetch("/templates/motion/angel-windows.json").then((response) =>
      response.json(),
    );
    const api = window.musart as AutomationApi;
    api.load(manifest.project);
  });
  await page.locator('canvas[data-renderer-ready="true"]').waitFor();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.locator('.motion-export-preview-surface[data-preview-ready="true"]').waitFor();
  const locks = await page.evaluateHandle(() => {
    const mutations: string[] = [];
    const observer = new MutationObserver((records) => {
      mutations.push(...records.map((record) => record.attributeName!));
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style", "data-scroll-locked"],
    });
    return { mutations, observer };
  });
  const trigger = page.locator("#motion-export-scale");
  await trigger.click();
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  await expect
    .poll(async () => {
      const field = await trigger.boundingBox(),
        menu = await list.boundingBox();
      return field && menu ? Math.abs(field.width - menu.width) : Infinity;
    })
    .toBeLessThan(1);
  await expect(list.getByRole("option", { selected: true })).toBeFocused();
  const original = await trigger.textContent();
  const half = list.getByRole("option", { name: "0.5×", exact: true });
  await half.hover();
  await page.mouse.down({ button: "right" });
  await page.mouse.up({ button: "right" });
  await expect(trigger).toHaveText(original!);
  await expect(list).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.hover();
  await page.mouse.down();
  await expect(list).toBeVisible();
  await half.hover();
  await page.mouse.up();
  await expect(trigger).toHaveText("0.5×");
  await expect(list).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(list).toBeVisible();
  await page.keyboard.press("End");
  await expect(list.getByRole("option", { name: "4×", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveText("4×");
  await expect(list).toHaveCount(0);
  expect(await locks.evaluate(({ mutations }) => mutations)).toEqual([]);
  await locks.evaluate(({ observer }) => observer.disconnect());
  await locks.dispose();
  await page.locator('.export-dialog [data-slot="dialog-close"]').click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "fx Window trails", exact: true }).click();
  const inspector = page.locator('.layer-attachment-popover[data-state="open"]');
  await expect(inspector).toBeFocused();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(inspector).toHaveCount(0);
  expect(errors).toEqual([]);
});
