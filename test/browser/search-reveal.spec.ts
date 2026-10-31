import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";

async function ready(page: Page) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      pages: [createPage({ width: 180, height: 180, layers: [createLayer("rectangle")] })],
    }),
  );
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  await expect(page.locator(".magic-search-trigger")).toBeVisible();
}

test("Cmd+K reveals complete rows in a visible sweep and never brightens disabled actions", async ({
  page,
}) => {
  await ready(page);
  const before = await page.evaluate(() => window.musart!.snapshot().revision);
  await page.evaluate(() => {
    type Sample = {
      phase: string | undefined;
      opacity: number[];
      blur: string[];
      disabled: boolean[];
      state: string[];
    };
    const samples: Sample[] = [];
    const probe = { samples, done: false, first: null as HTMLElement | null };
    Object.assign(window, { searchRevealProbe: probe });
    const observer = new MutationObserver(() => {
      const panel = document.querySelector<HTMLElement>("[data-magic-search]");
      if (!panel) return;
      observer.disconnect();
      const start = performance.now();
      const sample = () => {
        const rows = [...panel.querySelectorAll<HTMLElement>('[role="option"]')].slice(0, 7);
        if (!probe.first) probe.first = rows[0]!;
        samples.push({
          phase: panel.dataset.searchReveal,
          opacity: rows.map((row) => Number(getComputedStyle(row).opacity)),
          blur: rows.map((row) => getComputedStyle(row).filter),
          disabled: rows.map((row) => row.getAttribute("aria-disabled") === "true"),
          state: rows.map((row) => row.getAnimations()[0]?.playState ?? "finished"),
        });
        if (performance.now() - start < 650) requestAnimationFrame(sample);
        else probe.done = true;
      };
      sample();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  await page.keyboard.press("Control+k");
  await expect(page.locator("[data-magic-search]").getByRole("combobox")).toBeFocused();
  await page.waitForFunction(
    () => (window as unknown as { searchRevealProbe: { done: boolean } }).searchRevealProbe.done,
  );
  const samples = await page.evaluate(
    () =>
      (
        window as unknown as {
          searchRevealProbe: {
            samples: {
              phase: string;
              opacity: number[];
              blur: string[];
              disabled: boolean[];
              state: string[];
            }[];
          };
        }
      ).searchRevealProbe.samples,
  );
  expect(samples[0]!.phase).toBe("pending");
  expect(samples[0]!.state.every((state) => state === "paused")).toBe(true);
  expect(samples[0]!.opacity.every((opacity) => opacity === 0)).toBe(true);
  expect(
    samples.some((sample) => {
      const normalized = sample.opacity.map(
        (opacity, i) => opacity / (sample.disabled[i] ? 0.48 : 1),
      );
      return normalized[0]! > normalized[5]! + 0.2 && sample.blur[5] !== "blur(0px)";
    }),
  ).toBe(true);
  expect(samples[0]!.disabled.some(Boolean)).toBe(true);
  for (const sample of samples) {
    expect(sample.disabled).toEqual(samples[0]!.disabled);
    sample.opacity.forEach((opacity, i) => {
      if (sample.disabled[i]) expect(opacity).toBeLessThanOrEqual(0.481);
    });
  }
  const last = samples.at(-1)!;
  last.opacity.forEach((opacity, i) => expect(opacity).toBeCloseTo(last.disabled[i] ? 0.48 : 1, 2));
  const complete = page.locator('[role="option"][data-blur-complete]');
  await expect(complete.first()).toBeVisible();
  await page.keyboard.press("ArrowDown");
  expect(
    await page.evaluate(
      () =>
        document.querySelector('[role="option"]') ===
        (window as unknown as { searchRevealProbe: { first: HTMLElement } }).searchRevealProbe
          .first,
    ),
  ).toBe(true);
  expect(await complete.first().evaluate((node) => node.getAnimations().length)).toBe(0);
  await page.screenshot({ path: "artifacts/player/search-reveal.png" });
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-magic-search]")).toHaveCount(0);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(before);
});

test("Cmd+K category shadows scroll smoothly on hover, stop on leave, and respect reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 800 });
  await ready(page);
  await page.keyboard.press("Control+k");
  const viewport = page.locator(".magic-search-categories .horizontal-scroll-viewport");
  const shadow = page.locator(".magic-search-categories .scroll-shadow");
  await expect(shadow).toHaveAttribute("data-scroll-shadow-fade", "mask");
  const right = shadow.locator(".scroll-shadow-inline-end");
  await expect(right).not.toHaveAttribute("data-scroll-disabled", "");
  await right.hover();
  await expect.poll(() => viewport.evaluate((node) => node.scrollLeft)).toBeGreaterThan(25);
  const points = await viewport.evaluate(async (node) => {
    const points = [];
    for (let i = 0; i < 6; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      points.push(node.scrollLeft);
    }
    return points;
  });
  expect(points.at(-1)!).toBeGreaterThan(points[0]!);
  for (let i = 1; i < points.length; i++) expect(points[i]! - points[i - 1]!).toBeLessThan(15);
  await page.locator("[data-magic-search]").getByRole("combobox").hover();
  const stopped = await viewport.evaluate(async (node) => {
    const before = node.scrollLeft;
    for (let i = 0; i < 6; i++)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return [before, node.scrollLeft];
  });
  expect(stopped[1]).toBe(stopped[0]);
  await shadow.locator(".scroll-shadow-inline-start").hover();
  await expect.poll(() => viewport.evaluate((node) => node.scrollLeft)).toBeLessThan(2);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-magic-search]")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press("Control+k");
  await expect(page.locator("[data-magic-search]").getByRole("combobox")).toBeFocused();
  const disabled = page.locator('[role="option"][aria-disabled="true"]');
  await expect(disabled.first()).toHaveCSS("opacity", "0.48");
  expect(await disabled.first().evaluate((node) => node.getAnimations().length)).toBe(0);
  await viewport.focus();
  await page.keyboard.press("End");
  expect(await viewport.evaluate((node) => node.scrollLeft)).toBeGreaterThan(25);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-magic-search]")).toHaveCount(0);
});
