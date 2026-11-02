import { expect, test, type Locator } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { accentIds } from "../../apps/web/src/ui/brand/accents";

function luminance(color: string) {
  const values = color.match(/[\d.]+/g)!.map(Number);
  const srgb = color.startsWith("color(srgb ");
  if (!srgb && !color.startsWith("rgb")) throw Error(`Unsupported computed color: ${color}`);
  if (values[3] !== undefined && values[3] !== 1) throw Error(`Expected opaque color: ${color}`);
  return values.slice(0, 3).reduce((sum, value, i) => {
    const channel = srgb ? value : value / 255;
    const linear = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][i]!;
  }, 0);
}
async function readable(node: Locator, name: string) {
  const colors = await node.evaluate((element) => {
    const style = getComputedStyle(element);
    return { foreground: style.color, background: style.backgroundColor };
  });
  const a = luminance(colors.foreground),
    b = luminance(colors.background);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  expect(ratio, `${name}: ${JSON.stringify(colors)}`).toBeGreaterThanOrEqual(4.5);
}
async function settle(node: Locator) {
  await node.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished.catch(() => {})),
    );
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`real landing action labels keep contrast at the top and bottom in every ${theme} palette`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript((theme) => localStorage.setItem("musart.theme", theme), theme);
    await page.goto("/");
    for (const accent of accentIds) {
      await page.evaluate((accent) => localStorage.setItem("musart.accent.v1", accent), accent);
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-accent", accent);
      await page.mouse.move(0, 0);
      const actions = page.locator(".landing-cta");
      await expect(actions).toHaveCount(3);
      for (let i = 0; i < 3; i++) await readable(actions.nth(i), `${theme}/${accent}/CTA ${i}`);
      await readable(page.locator(".site-header .site-try"), `${theme}/${accent}/header`);
      for (const location of [".landing-intro", ".landing-footer"]) {
        const action = page.locator(`${location} .landing-cta`);
        await action.hover();
        await settle(action);
        await readable(action, `${theme}/${accent}/${location}/hover`);
        if (accent === "violet")
          await page
            .locator(location)
            .screenshot({ path: info.outputPath(`${theme}-${location.slice(1)}.png`) });
        await page.mouse.move(0, 0);
        await settle(action);
      }
    }
  });
}

test("editor dimension labels pair their ink with the actual selected fill in every palette", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.addInitScript(() => {
    localStorage.setItem("musart.theme", "system");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await expect(page.locator('canvas[data-renderer-ready="true"]')).toBeVisible();
  const project = createProject({
    pages: [
      createPage({
        width: 640,
        height: 480,
        layers: [
          createLayer("rectangle", {
            id: "contrast-label",
            x: 160,
            y: 100,
            width: 320,
            height: 160,
            fill: "#8B5CF6",
          }),
        ],
      }),
    ],
  });
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["contrast-label"]);
  }, project);
  const label = page.locator(
    '.canvas-selection[data-layer-id="contrast-label"] .canvas-selection-size',
  );
  await expect(label).toBeVisible();
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(theme === "dark");
    for (const accent of accentIds) {
      // Exercise the same platform preference update received from another open tab.
      await page.evaluate((accent) => {
        localStorage.setItem("musart.accent.v1", accent);
        window.dispatchEvent(
          new StorageEvent("storage", { key: "musart.accent.v1", newValue: accent }),
        );
      }, accent);
      await expect(page.locator("html")).toHaveAttribute("data-accent", accent);
      await readable(label, `${theme}/${accent}/dimension label`);
    }
  }
});
