import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import type * as Controls from "./support/effect-locales";

test("new material controls and catalog use translated SDK labels, including RTL", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__material-locales", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><body></body>",
    }),
  );
  await page.setViewportSize({ width: 412, height: 900 });
  await mkdir("artifacts/material-treatments/locales", { recursive: true });
  for (const language of ["de", "ja", "ar"] as const)
    for (const [type, propertyKey] of [
      ["wax", "blur"],
      ["melt", "tone"],
      ["emboss", "mode"],
    ] as const) {
      await page.goto("/__material-locales");
      const labels = await page.evaluate(
        async ({ root, language, type, propertyKey }) => {
          const preamble = "/@react-refresh";
          const refresh = (await import(/* @vite-ignore */ preamble)).default;
          refresh.injectIntoGlobalHook(window);
          Object.assign(window, {
            $RefreshReg$: () => {},
            $RefreshSig$: () => (value: unknown) => value,
            __vite_plugin_react_preamble_installed__: true,
          });
          const path = `/@fs${root}/test/browser/support/effect-locales.tsx`;
          return ((await import(/* @vite-ignore */ path)) as typeof Controls).mountEffectLocales(
            language,
            type,
            propertyKey,
          );
        },
        { root: process.cwd(), language, type, propertyKey },
      );
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await expect(page.locator("html")).toHaveAttribute("dir", language === "ar" ? "rtl" : "ltr");
      await expect(page.getByRole("heading", { name: labels.name, exact: true })).toBeVisible();
      if (labels.choices.length) {
        const choice = page.getByRole("combobox", { name: labels.parameter, exact: true });
        await choice.click();
        await page.getByRole("option", { name: labels.choices[1]!, exact: true }).click();
        await expect(choice).toContainText(labels.choices[1]!);
        await expect(choice).toBeFocused();
        const endpoint = page.getByRole("combobox", { name: labels.from, exact: true });
        await endpoint.click();
        await page.getByRole("option", { name: labels.choices[1]!, exact: true }).click();
        await expect(endpoint).toContainText(labels.choices[1]!);
      } else {
        await expect(
          page.getByRole("textbox", { name: labels.parameter, exact: true }),
        ).toBeVisible();
      }
      const search = page.getByRole("textbox", { name: labels.search, exact: true });
      await search.fill(labels.name);
      await expect(page.getByRole("button", { name: labels.name, exact: true })).toBeVisible();
      expect(await page.locator("body").evaluate((element) => element.style.overflow)).not.toBe(
        "hidden",
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      );
      await page.screenshot({
        path: `artifacts/material-treatments/locales/${language}-${type}.png`,
        fullPage: true,
      });
    }
  expect(errors).toEqual([]);
});
