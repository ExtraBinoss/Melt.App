import { expect, test } from "@playwright/test";
import en from "../../apps/web/src/components/search/locales/en.json" with { type: "json" };
import de from "../../apps/web/src/components/search/locales/de.json" with { type: "json" };
import ja from "../../apps/web/src/components/search/locales/ja.json" with { type: "json" };
import ar from "../../apps/web/src/components/search/locales/ar.json" with { type: "json" };

test("search and shortcut settings follow the active locale while retaining English queries", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "en");
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  let currentTitle = en.title.replace("{{brandName}}", "Melt");
  for (const [code, language, native, resource] of [
    ["de", "German", "Deutsch", de],
    ["ja", "Japanese", "日本語", ja],
    ["ar", "Arabic", "العربية", ar],
  ] as const) {
    await page.getByRole("button", { name: currentTitle, exact: true }).click();
    const chooser = page.getByRole("dialog").filter({ has: page.getByRole("combobox") });
    await chooser.getByRole("combobox").fill(language);
    await chooser.getByRole("option").filter({ hasText: native }).click();
    await expect(chooser).toBeHidden();
    await expect(page.locator("html")).toHaveAttribute("lang", code);
    const title = resource.title.replace("{{brandName}}", "Melt");
    currentTitle = title;
    await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible();
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: title, exact: true }),
      query = palette.getByRole("combobox");
    for (const text of [
      resource.effectLabels.blur,
      resource.effectDescriptions.blur,
      en.effectLabels.blur,
      en.effectDescriptions.blur,
    ]) {
      await query.fill(text);
      await expect(
        palette.getByRole("option").filter({ hasText: resource.effectLabels.blur }).first(),
      ).toBeVisible();
    }
    await query.fill(resource.commandLabels.save);
    await expect(palette.getByRole("option").first()).toContainText(resource.commandLabels.save);
    await page.keyboard.press("Escape");
    await page.keyboard.press("?");
    const shortcuts = page.getByRole("dialog", { name: resource.shortcuts, exact: true }),
      filter = shortcuts.getByRole("searchbox");
    for (const text of [resource.descriptions.save, en.descriptions.save]) {
      await filter.fill(text);
      await expect(shortcuts.locator('[data-binding-command="action:save"]')).toBeVisible();
    }
    await filter.fill("ctrl+j");
    const copy = shortcuts.locator('[data-binding-command="action:layerViaCopy"]');
    await expect(copy).toContainText(resource.commandLabels.layerViaCopy);
    await expect(copy.locator('[data-slot="kbd-separator"]')).toHaveText(["+"]);
    const keys = copy.locator('[data-slot="kbd"]'),
      first = (await keys.nth(0).boundingBox())!,
      last = (await keys.nth(1).boundingBox())!;
    expect(first.x).toBeLessThan(last.x);
    await expect(page.locator("html")).toHaveAttribute("dir", code === "ar" ? "rtl" : "ltr");
    const close = shortcuts.getByRole("button", { name: resource.close, exact: true }),
      closeBox = (await close.boundingBox())!,
      dialogBox = (await shortcuts.boundingBox())!;
    expect(closeBox.x + closeBox.width / 2 < dialogBox.x + dialogBox.width / 2).toBe(code === "ar");
    await expect(shortcuts.locator('[data-slot="dialog-header"]')).toHaveCSS("text-align", "start");
    await page.screenshot({ path: `artifacts/search-locales/${code}.png` });
    await shortcuts.getByRole("button", { name: resource.close, exact: true }).click();
    await expect(shortcuts).toBeHidden();
  }
  expect(errors).toEqual([]);
});
