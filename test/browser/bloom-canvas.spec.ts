import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

test("1080p Bloom canvas shares synchronized video copies and keeps presenting actual Motion frames", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.theme", "dark");
  });
  await page.goto("/editor?template=bloom-windows&automation=1");
  await page.waitForFunction(
    () => window.musart?.snapshot().project.name === "Bloom Windows",
    undefined,
    { timeout: 30000 },
  );
  const canvas = page.locator(".canvas-artboard canvas");
  await expect(canvas).toBeVisible({ timeout: 20000 });
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true");
  const document = await page.evaluate(() => window.musart!.snapshot().project);
  expect(Object.values(document.assets).find((asset) => asset.kind === "video")?.width).toBe(1920);
  await page.keyboard.press("Control+Space");
  const cohort = await canvas.evaluate(async (element) => {
    const canvas = element as HTMLCanvasElement;
    const times: number[] = [],
      clocks: number[] = [];
    const start = performance.now();
    const observer = new MutationObserver(() => {
      const raw = canvas.dataset.presentedMotionTime;
      if (!raw) return;
      const time = JSON.parse(raw) as { value: number; rate: number };
      times.push(performance.now());
      clocks.push(time.value / time.rate);
    });
    observer.observe(canvas, { attributes: true, attributeFilter: ["data-presented-motion-time"] });
    await new Promise((resolve) => setTimeout(resolve, 3200));
    observer.disconnect();
    const gaps = times
      .slice(1)
      .map((time, index) => time - times[index]!)
      .sort((a, b) => a - b);
    return {
      elapsed: performance.now() - start,
      frames: times.length,
      gapP95: gaps[Math.floor(gaps.length * 0.95)] ?? null,
      times,
      clocks,
      stats: JSON.parse(canvas.dataset.gpuStats ?? "{}"),
      error: canvas.dataset.renderError ?? null,
    };
  });
  await page.keyboard.press("Control+Space");
  await mkdir("artifacts/bloom-windows", { recursive: true });
  await writeFile("artifacts/bloom-windows/canvas-cadence.json", JSON.stringify(cohort, null, 2));
  expect(cohort.error).toBeNull();
  expect(cohort.frames).toBeGreaterThan(30);
  expect(cohort.stats.video.uploads.streams).toBe(1);
  expect(cohort.stats.video.playback).toHaveLength(1);
  expect(cohort.stats.readbacks).toBe(0);
  expect(cohort.stats.cacheBytes).toBeLessThanOrEqual(cohort.stats.maxBytes);
  // The first presentation may still carry the pre-Play pose. Compare steady
  // presented timestamps with their own wall-clock interval, rather than timer start.
  const frame = 2;
  const elapsed = (cohort.times.at(-1)! - cohort.times[frame]!) / 1000;
  expect(cohort.clocks.at(-1)! - cohort.clocks[frame]!).toBeLessThanOrEqual(elapsed + 0.1);
  expect(
    Math.max(...cohort.clocks.slice(1).map((clock, index) => clock - cohort.clocks[index]!)),
  ).toBeLessThan(0.2);
});
