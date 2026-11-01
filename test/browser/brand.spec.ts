import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { brand } from "../../apps/web/src/ui/brand/config";
import { mascotTint } from "../../apps/web/src/ui/brand/tint";
import { openProjectLibrary } from "./support/project-library";
import { installReadbackProbe } from "./support/readback-probe";
const metrics = [
  ".musart-app",
  ".inspector",
  ".canvas-area",
  ".editor-canvas",
  ".editor-gpu-scene",
];
const counts = (page: Page) =>
  page.evaluate(
    (selectors) =>
      selectors.map((selector) =>
        document.querySelector(selector)?.getAttribute("data-react-renders"),
      ),
    metrics,
  );

test("Melt shares its static identity, violet actions and real install artwork on mobile and both themes", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("musart.language", "en"));
  await page.goto("/");
  await expect(page).toHaveTitle("Melt — Design with ease. Animate to captivate.");
  await expect(page.getByRole("button", { name: "Try Melt", exact: true })).toBeVisible();
  const logo = page.locator(".landing-nav .melt-mark > img");
  await expect(logo).toHaveJSProperty("naturalWidth", 256);
  const source = await logo.getAttribute("src");
  expect(source).toMatch(/melt-idle\.webp\?v=[a-f0-9]{12}$/);
  await expect(page.locator(".landing-nav .melt-mark svg")).toHaveCount(0);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(colorScheme === "dark");
    expect(
      await page
        .locator(".landing-cta")
        .first()
        .evaluate((node) => getComputedStyle(node).backgroundColor),
    ).toBe("rgb(124, 58, 237)");
    await page.screenshot({ path: info.outputPath(`melt-${colorScheme}.png`) });
  }
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
  expect(await logo.getAttribute("src")).toBe(source);
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.name).toBe("Melt");
  expect(manifest.theme_color).toBe(brand.colors.primary);
  const iconHref = await page.locator('link[rel="icon"]').getAttribute("href");
  expect(iconHref).toMatch(/melt\.svg\?v=[a-f0-9]{12}$/);
  const icon = await (await page.request.get(iconHref!)).text();
  for (const stop of mascotTint) expect(icon).toContain(`stop-color="${stop.color}"`);
  for (const size of [180, 192, 512]) {
    const dimensions = await page.evaluate(async (size) => {
      const image = new Image();
      image.src = `branding/melt-icon-${size}.png`;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, size);
    expect(dimensions).toEqual([size, size]);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("real pending work animates only its SVG leaf, stops for reduced motion and cancels without document changes", async ({
  page,
}, info) => {
  await installReadbackProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      id: "melt-brand-witness",
      pages: [
        createPage({
          width: 320,
          height: 240,
          layers: [createLayer("rectangle", { x: 20, y: 20, width: 80, height: 60 })],
        }),
      ],
    }),
  );
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  await openProjectLibrary(page);
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let intercepted = 0;
  await page.route("**/templates/motion/bloom-windows/bloom-windows.json*", async (route) => {
    intercepted++;
    await gate;
    await route.abort("aborted");
  });
  const beforeDocument = await page.evaluate(() => window.musart!.snapshot().project);
  await page
    .locator(".template-card-entry")
    .filter({ hasText: "Bloom Windows" })
    .locator(".library-item-open")
    .click();
  await expect.poll(() => intercepted).toBeGreaterThan(0);
  const pending = page.locator(".template-loading");
  await expect(pending).toBeVisible();
  const mascot = pending.locator("svg.melt-mascot");
  await expect(mascot).toHaveAttribute("data-brand-active", "true");
  const before = await counts(page);
  expect(before.every((count) => count !== null && count !== undefined)).toBe(true);
  const first = await mascot.locator('[data-mascot-part="body"]').getAttribute("d");
  await expect
    .poll(() => mascot.locator('[data-mascot-part="body"]').getAttribute("d"))
    .not.toBe(first);
  expect(await counts(page)).toEqual(before);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
  const stopped = await mascot.locator('[data-mascot-part="body"]').getAttribute("d");
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
  expect(await mascot.locator('[data-mascot-part="body"]').getAttribute("d")).toBe(stopped);
  expect(await counts(page)).toEqual(before);
  await page.screenshot({ path: info.outputPath("melt-preparing.png") });
  await pending.getByRole("button", { name: "Annuler", exact: true }).click();
  release();
  await expect(pending).toHaveCount(0);
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(beforeDocument);
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});
