import { expect, test } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import type * as Localization from "../../apps/web/src/state/i18n";

const locales = ["en", "fr", "de", "es", "it", "pt", "nl", "pl", "ja", "ko", "zh", "ar"] as const;
test("object selection has readable steps, complete mode labels and native focus in all twelve languages", async ({
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
  await page.getByRole("button", { name: "Object selection", exact: true }).click();
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
    await expect(panel.locator(".object-selection-guide")).toContainText(strings.objectLeftClick);
    await expect(panel.locator(".object-selection-guide")).toContainText(
      strings.objectOriginalHelp,
    );
    const field = panel.getByRole("combobox", { name: strings.objectMode });
    const before = await page.evaluate(() => ({
      body: document.body.getAttribute("style"),
      html: document.documentElement.getAttribute("style"),
    }));
    const width = await field.evaluate((node) => node.clientWidth);
    expect(width).toBeGreaterThan(230);
    await field.click();
    const menu = page.getByRole("listbox", { name: strings.objectMode });
    await expect(menu).toBeVisible();
    expect(
      await menu
        .locator(".select-label-text")
        .evaluateAll((nodes) => nodes.every((node) => node.scrollWidth <= node.clientWidth + 1)),
    ).toBe(true);
    const box = menu.getByRole("option", { name: strings.objectBox, exact: true });
    await box.click({ button: "right" });
    await expect(menu).toBeVisible();
    await expect(field).toHaveText(strings.objectPoints);
    await box.focus();
    await page.keyboard.press("Enter");
    await expect(field).toBeFocused();
    await expect(panel.locator(".object-selection-guide")).toContainText(strings.objectBoxHelp);
    await field.click();
    await page.getByRole("option", { name: strings.objectPoints, exact: true }).click();
    expect(
      await page.evaluate(() => ({
        body: document.body.getAttribute("style"),
        html: document.documentElement.getAttribute("style"),
      })),
    ).toEqual(before);
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
  await panel.hover({ position: { x: 140, y: 200 } });
  await page.mouse.wheel(0, 1500);
  await expect(panel.locator(".object-selection-detection button")).toBeVisible();
  expect(await panel.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
});

test("overflowing select labels pan on focus in both directions and retain full text with reduced motion", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.language", "en");
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.getByRole("button", { name: "Object selection", exact: true }).click();
  const field = page.locator(".object-selection-mode-field");
  for (const locale of ["fr", "ar"] as const) {
    const text =
      locale === "fr"
        ? "Rectangle autour du sujet à conserver et à affiner avec des points"
        : "مستطيل حول العنصر الذي تريد الاحتفاظ به ثم تحسين حدوده باستخدام النقاط";
    await page.evaluate(
      async ({ locale, text }) => {
        const url = "/src/state/i18n/index.ts";
        const localization = (await import(url)) as typeof Localization;
        localization.i18n.addResource(locale, "pixelSelection", "objectBox", text);
        await localization.changeLanguage(locale);
      },
      { locale, text },
    );
    await field.click();
    await page.getByRole("option", { name: text, exact: true }).click();
    const label = field.locator(".select-label");
    await expect(label).toHaveAttribute("data-overflow");
    await expect(field).toHaveAttribute("title", text);
    await field.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(field).toBeFocused();
    await expect
      .poll(
        async () =>
          (locale === "ar" ? 1 : -1) *
          (await label
            .locator(".select-label-text")
            .evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m41)),
      )
      .toBeGreaterThan(1);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(label.locator(".select-label-text")).toHaveCSS("animation-name", "none");
    await expect(field).toHaveAttribute("title", text);
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
});
