import { expect, test } from "@playwright/test";
import fr from "../../apps/web/src/components/projects/landing/locales/fr.json" with { type: "json" };
import de from "../../apps/web/src/components/projects/landing/locales/de.json" with { type: "json" };
import ar from "../../apps/web/src/components/projects/landing/locales/ar.json" with { type: "json" };
import ja from "../../apps/web/src/components/projects/landing/locales/ja.json" with { type: "json" };

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test("FAQ answers work before JavaScript, keep one answer open and remain usable on tool pages", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  try {
    const page = await context.newPage();
    await page.goto(baseURL!);
    const questions = page.locator(".site-faq-item summary");
    await questions.first().scrollIntoViewIfNeeded();
    await questions.first().focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".site-faq-item").first()).toHaveAttribute("open");
    await expect
      .poll(() =>
        page
          .locator(".site-faq-item")
          .first()
          .locator(".site-faq-answer")
          .evaluate((node) => node.getBoundingClientRect().height),
      )
      .toBeGreaterThan(20);
    await questions.nth(1).focus();
    await page.keyboard.press("Space");
    await expect(page.locator(".site-faq-item").nth(1)).toHaveAttribute("open");
    await expect(page.locator(".site-faq-item").first()).not.toHaveAttribute("open");
    await page.goto(`${baseURL}/tools/ascii-converter`);
    await page.locator(".site-faq-item summary").first().click();
    await expect(page.locator(".site-faq-item").first()).toHaveAttribute("open");
  } finally {
    await context.close();
  }
});

test("localized headlines stay readable and unclipped on narrow touch viewports", async ({
  page,
  context,
  baseURL,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Each cookie is the input under test, rather than the preceding locale's saved preference.
  await context.addInitScript(() => localStorage.removeItem("musart.language"));
  for (const [language, copy] of Object.entries({ fr, de, ar, ja })) {
    await context.addCookies([{ name: "musart.language", value: language, url: baseURL! }]);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      const heading = page.getByRole("heading", {
        level: 1,
        name: `${copy.titleFirst} ${copy.titleSecond}`,
        exact: true,
      });
      await expect(heading).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const geometry = await heading.evaluate((node) => {
        const bounds = node.getBoundingClientRect();
        const text = [...node.querySelectorAll(".hero-chunk")].flatMap((line) => {
          const range = document.createRange();
          range.selectNodeContents(line);
          return [...range.getClientRects()].map((rect) => ({
            left: rect.left,
            right: rect.right,
          }));
        });
        return {
          left: bounds.left,
          right: bounds.right,
          font: parseFloat(getComputedStyle(node).fontSize),
          text,
          viewport: innerWidth,
          nodes: node.querySelectorAll("*").length,
        };
      });
      expect(geometry.font).toBeGreaterThanOrEqual(40);
      expect(geometry.nodes).toBeLessThanOrEqual(6);
      expect(geometry.left).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
      for (const rect of geometry.text) {
        expect(rect.left).toBeGreaterThanOrEqual(geometry.left - 2);
        expect(rect.right).toBeLessThanOrEqual(geometry.right + 2);
      }
      if (width === 390)
        await page.screenshot({ path: info.outputPath(`landing-${language}-${width}.png`) });
    }
  }
});

test("six feature cards, FAQ anchor and footer language controls remain usable on touch", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("[data-video-slot]")).toHaveCount(6);
  const timelapse = page.locator('[data-feature="timelapse"]');
  await timelapse.scrollIntoViewIfNeeded();
  await expect(timelapse).toContainText("10,000");
  const output = page.locator('[data-feature="export"]');
  await output.scrollIntoViewIfNeeded();
  await expect(output).toContainText("MP4/WebM");
  await page.locator(".site-footer").scrollIntoViewIfNeeded();
  await page.getByRole("combobox", { name: "Language", exact: true }).click();
  await page.getByRole("option", { name: "Français", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(
    `${fr.titleFirst} ${fr.titleSecond}`,
  );
  await page.locator('.site-header nav a[href$="#faq"]').click();
  await expect(page).toHaveURL(/#faq$/);
  await expect
    .poll(() => page.locator("#faq").evaluate((node) => Math.abs(node.getBoundingClientRect().top)))
    .toBeLessThan(300);
  expect(errors).toEqual([]);
});

test("hero and carousel animation run without repeated React commits or editor downloads", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.addInitScript(() => {
    const state = window as unknown as {
      __landingCommits: number;
      __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown;
    };
    state.__landingCommits = 0;
    const renderers = new Map();
    state.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers,
      inject(renderer: unknown) {
        const id = renderers.size + 1;
        renderers.set(id, renderer);
        return id;
      },
      onCommitFiberRoot() {
        state.__landingCommits++;
      },
      onCommitFiberUnmount() {},
    };
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const carousel = page.locator(".landing-showcase-scroll");
  await expect.poll(() => carousel.getAttribute("data-carousel-position")).not.toBe("0");
  const commits = () =>
    page.evaluate(() => (window as unknown as { __landingCommits: number }).__landingCommits);
  await expect.poll(commits).toBeGreaterThan(0);
  await page.waitForTimeout(200);
  const before = await commits();
  await page.waitForTimeout(1000);
  expect(await commits()).toBe(before);
  await carousel.focus();
  const position = await carousel.getAttribute("data-carousel-position");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => carousel.getAttribute("data-carousel-position")).not.toBe(position);
  expect(
    requests.filter((url) =>
      /\/(Studio|App|EditorCanvas|three\.(core|webgpu))-[^/]+\.js/.test(url),
    ),
  ).toEqual([]);
  await expect(page.locator('head link[rel="preload"][as="font"]')).toHaveCount(1);
});
