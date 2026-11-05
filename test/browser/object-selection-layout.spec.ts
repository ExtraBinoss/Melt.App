import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type * as Localization from "../../apps/web/src/state/i18n";
import { objectSelectionFixture } from "./support/object-selection-fixture";
const locales = ["en", "fr", "de", "es", "it", "pt", "nl", "pl", "ja", "ko", "zh", "ar"] as const;
test("background removal stays compact in all twelve languages, with refinement behind an explicit action", async ({
  page,
}) => {
  await objectSelectionFixture(page);
  await page.getByRole("button", { name: "Remove background", exact: true }).click();
  const panel = page.locator('.tool-settings[data-tool="segment"]');
  await expect(panel.getByRole("button", { name: "Refine", exact: true })).toBeVisible();
  for (const locale of locales) {
    const strings = JSON.parse(
      await readFile(`apps/web/src/services/selection/wand/locales/${locale}.json`, "utf8"),
    );
    await page.evaluate(async (locale) => {
      const url = "/src/state/i18n/index.ts";
      const localization = (await import(url)) as typeof Localization;
      await localization.changeLanguage(locale);
    }, locale);
    await expect(panel).toContainText(strings.backgroundDone);
    await expect(
      panel.getByRole("button", { name: strings.refineBackground, exact: true }),
    ).toBeVisible();
    await expect(
      panel.locator(".object-selection-guide, .local-model, [role=combobox]"),
    ).toHaveCount(0);
    expect(await panel.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(
      1,
    );
    expect(await panel.evaluate((node) => node.getBoundingClientRect().height)).toBeLessThan(180);
  }
});
