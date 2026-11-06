import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import de from "../../apps/web/src/components/properties/effects/library/wave-distortion/locales/de.json" with { type: "json" };
import ja from "../../apps/web/src/components/properties/effects/library/wave-distortion/locales/ja.json" with { type: "json" };
import ar from "../../apps/web/src/components/properties/effects/library/wave-distortion/locales/ar.json" with { type: "json" };
import deMotion from "../../apps/web/src/components/properties/effects/effect-motion/locales/de.json" with { type: "json" };
import jaMotion from "../../apps/web/src/components/properties/effects/effect-motion/locales/ja.json" with { type: "json" };
import arMotion from "../../apps/web/src/components/properties/effects/effect-motion/locales/ar.json" with { type: "json" };
import deCatalog from "../../apps/web/src/components/layers/catalog/locales/de.json" with { type: "json" };
import jaCatalog from "../../apps/web/src/components/layers/catalog/locales/ja.json" with { type: "json" };
import arCatalog from "../../apps/web/src/components/layers/catalog/locales/ar.json" with { type: "json" };

test("native effect controls, Motion endpoints and catalog follow German, Japanese and Arabic", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__effect-locales", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" }),
  );
  for (const [language, labels, motion, catalog] of [
    ["de", de, deMotion, deCatalog],
    ["ja", ja, jaMotion, jaCatalog],
    ["ar", ar, arMotion, arCatalog],
  ] as const) {
    await page.setViewportSize({ width: 412, height: 900 });
    await page.goto("/__effect-locales");
    await page.evaluate(
      async ({ root, language }) => {
        const preamble = "/@react-refresh";
        const refresh = (await import(/* @vite-ignore */ preamble)).default;
        refresh.injectIntoGlobalHook(window);
        Object.assign(window, {
          $RefreshReg$: () => {},
          $RefreshSig$: () => (value: unknown) => value,
          __vite_plugin_react_preamble_installed__: true,
        });
        const path = `/@fs${root}/test/browser/support/effect-locales.tsx`;
        await (await import(/* @vite-ignore */ path)).mountEffectLocales(language);
      },
      { root: process.cwd(), language },
    );
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    await expect(page.locator("html")).toHaveAttribute("dir", language === "ar" ? "rtl" : "ltr");
    await expect(page.getByRole("heading", { name: labels.name, exact: true })).toBeVisible();
    const wave = page.getByRole("combobox", { name: labels.parameter.waveform, exact: true });
    await wave.click();
    await page.getByRole("option", { name: labels.choice.sawtooth, exact: true }).click();
    await expect(wave).toContainText(labels.choice.sawtooth);
    const from = page.getByRole("combobox", { name: motion.from, exact: true });
    await from.click();
    await page.getByRole("option", { name: labels.choice.square, exact: true }).click();
    await expect(from).toContainText(labels.choice.square);
    await expect(from).toBeFocused();
    const search = page.getByRole("textbox", { name: catalog.search, exact: true });
    await search.fill(labels.name);
    await expect(page.getByRole("button", { name: labels.name, exact: true })).toBeVisible();
    expect(await page.locator("body").evaluate((element) => element.style.overflow)).not.toBe(
      "hidden",
    );
    await expect(search).toBeFocused();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
    await mkdir("artifacts/effect-locales", { recursive: true });
    await page.screenshot({ path: `artifacts/effect-locales/${language}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});
