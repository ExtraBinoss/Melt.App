import { expect, test } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import type * as Localization from "../../apps/web/src/state/i18n";

const locales = ["en", "fr", "de", "es", "it", "pt", "nl", "pl", "ja", "ko", "zh", "ar"] as const;
test("object selection has readable automatic and unified refinement controls in all twelve languages", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.language", "en");
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.getByRole("button", { name: "Remove background", exact: true }).click();
  const panel = page.locator('.tool-settings[data-tool="segment"]');
  await expect(panel).toBeVisible();
  await mkdir("artifacts/object-selection/screenshots", { recursive: true });
  for (const locale of locales) {
    const strings = JSON.parse(
      await readFile(`apps/web/src/services/selection/wand/locales/${locale}.json`, "utf8"),
    );
    await page.evaluate(async (locale) => {
      const url = "/src/state/i18n/index.ts";
      const localization = (await import(url)) as typeof Localization;
      await localization.changeLanguage(locale);
    }, locale);
    await expect(panel.locator(".object-selection-guide > li")).toHaveCount(3);
    await expect(panel.getByRole("combobox")).toHaveCount(0);
    await expect(
      panel.getByRole("button", { name: strings.objectBackground, exact: true }),
    ).toBeVisible();
    await expect(panel.locator(".object-selection-guide")).toContainText(strings.objectGestureHelp);
    await expect(panel.locator(".object-selection-guide")).toContainText(strings.objectApplyHelp);
    expect(await panel.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(
      1,
    );
    if (locale === "fr" || locale === "ar")
      await panel.screenshot({ path: `artifacts/object-selection/screenshots/${locale}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 560 });
  expect(await panel.evaluate((node) => node.getBoundingClientRect().bottom)).toBeLessThanOrEqual(
    560,
  );
  await panel.locator(".object-selection-models summary").click();
  await panel.hover({ position: { x: 140, y: 200 } });
  await page.mouse.wheel(0, 1500);
  await expect(panel.locator(".object-selection-models summary")).toBeVisible();
  expect(await panel.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
});
