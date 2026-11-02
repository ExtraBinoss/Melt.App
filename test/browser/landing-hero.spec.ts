import { expect, test } from "@playwright/test";
import { measureHeroContourPoints } from "./support/hero-contours";

for (const language of ["en", "fr"] as const) {
  test(`reference point clouds trace and fill each real glyph, then hover replays the same geometry (${language})`, async ({
    page,
    context,
    baseURL,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await context.addCookies([{ name: "musart.language", value: language, url: baseURL! }]);
    await page.goto("/");
    const mascot = page.locator(".hero-mascot-stage");
    const stage = page.locator(".hero-type-stage");
    await expect(mascot).toHaveAttribute("data-face-ready");
    await expect(stage).toHaveAttribute("data-ink-pending");
    await expect(stage).toHaveAttribute("data-vector-ready");
    await expect(stage).toHaveAttribute("data-ink-auto");
    const chunks = stage.locator(".hero-chunk");
    const glyphs = stage.locator("[data-hero-glyph]");
    await expect(glyphs.first()).toHaveAttribute("opacity", "1");
    await expect(glyphs.last()).toHaveAttribute("opacity", "0");
    const motion = await page.evaluate(
      () =>
        new Promise<{ time: number; scale: number }[]>((resolve) => {
          const landing = document.querySelector<HTMLElement>(".hero-mascot-landing")!;
          const samples: { time: number; scale: number }[] = [];
          const sample = () => {
            samples.push({
              time: performance.now(),
              scale: new DOMMatrixReadOnly(getComputedStyle(landing).transform).a,
            });
            if (samples.length === 24) resolve(samples);
            else requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        }),
    );
    expect(new Set(motion.map(({ scale }) => scale.toFixed(5))).size).toBeGreaterThan(6);
    await info.attach("native-mascot-motion", {
      body: JSON.stringify(motion),
      contentType: "application/json",
    });
    await page
      .locator(".landing-intro")
      .screenshot({ path: info.outputPath("hero-writing.png"), animations: "allow" });
    await expect(stage).not.toHaveAttribute("data-ink-pending");
    await expect(stage).not.toHaveAttribute("data-ink-active");
    await expect(mascot).toBeHidden();
    await expect(mascot).toHaveAttribute("data-mascot-finished");
    expect(await mascot.locator(".hero-mascot-face").innerHTML()).toBe("");
    await page.evaluate(() => document.fonts.ready);
    const colors = await chunks.evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).color),
    );
    expect(colors[0]).not.toBe(colors[1]);
    const accents = await stage
      .locator('.hero-glyph-overlay > g[data-hero-tone="1"]')
      .first()
      .evaluate((node) => ({
        stroke: getComputedStyle(node.querySelector("path")!).stroke,
        fill: getComputedStyle(node.querySelector("path")!).fill,
        point: getComputedStyle(node.querySelector("circle")!).fill,
      }));
    expect(accents).toEqual({ stroke: colors[1], fill: colors[1], point: colors[1] });
    await page.locator(".landing-intro").screenshot({ path: info.outputPath("hero-settled.png") });
    const target = await chunks.nth(1).evaluate((node) => {
      const range = document.createRange();
      range.setStart(node.firstChild!, 2);
      range.setEnd(node.firstChild!, 3);
      const rect = range.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await page.mouse.move(target.x, target.y);
    await expect(stage).toHaveAttribute("data-ink-active");
    await expect(
      stage.locator('.hero-glyph-overlay > g[opacity="1"] > path').first(),
    ).toHaveAttribute("fill-opacity", "0");
    expect(await stage.locator(".hero-glyph-overlay circle").count()).toBeGreaterThan(30);
    expect(await chunks.first().textContent()).toBe(language === "fr" ? "Créez et" : "Design and");
    await page
      .locator(".landing-intro")
      .screenshot({ path: info.outputPath("hero-hover-light.png") });
    const contour = await measureHeroContourPoints(page);
    expect(contour.points).toBeGreaterThan(12);
    expect(contour.closeToEdge / contour.points, JSON.stringify(contour)).toBeGreaterThan(0.95);
    await page.mouse.move(10, 10);
    await expect(stage).not.toHaveAttribute("data-ink-active");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.mouse.move(target.x, target.y);
    await expect(stage).toHaveAttribute("data-ink-active");
    await page
      .locator(".landing-intro")
      .screenshot({ path: info.outputPath("hero-hover-dark.png") });
    expect(errors).toEqual([]);
  });
}

test("reduced motion skips the mascot and writing sequence with immediately readable text", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const heading = page.getByRole("heading", { level: 1, name: "Design and animate." });
  await expect(heading).toBeVisible();
  await expect(page.locator(".hero-mascot-stage")).toBeHidden();
  await heading.hover();
  await expect(page.locator(".hero-type-stage")).not.toHaveAttribute("data-ink-active");
  expect(
    await page
      .locator(".landing-intro")
      .evaluate((node) => node.getAnimations({ subtree: true }).length),
  ).toBe(0);
  await expect(page.locator(".landing-intro .landing-cta")).toHaveCSS("opacity", "1");
});

test("the complete native heading remains available without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: "reduce" });
  try {
    const page = await context.newPage();
    await page.goto(baseURL!);
    await expect(
      page.getByRole("heading", { level: 1, name: "Design and animate." }),
    ).toBeVisible();
    await expect(page.locator(".hero-chunk").first()).not.toHaveCSS("color", "rgba(0, 0, 0, 0)");
    await expect(page.locator(".landing-intro .landing-cta")).toBeVisible();
  } finally {
    await context.close();
  }
});
