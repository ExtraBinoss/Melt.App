import { checkBloomBackdrop } from "./support/bloom-presentation";
import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

test("real Bloom Windows card presents continuous motion, pauses and releases on native hover", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.theme", "dark");
  });
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("bloom-windows")) requests.push(request.url());
  });
  await page.goto("/dashboard");
  const tile = page
    .locator(".template-card-entry")
    .filter({ has: page.getByRole("button", { name: "Preview Bloom Windows", exact: true }) });
  await expect(tile).toBeVisible({ timeout: 30000 });
  await expect(tile.locator(".motion-preview-hint")).toHaveCount(0);
  await tile.locator(".template-card").hover();
  const preview = tile.locator(".motion-template-preview");
  await expect(preview).toHaveAttribute("data-preview-status", "playing", { timeout: 20000 });
  const profiler =
    process.env.MELT_BLOOM_PROFILE === "1" ? await page.context().newCDPSession(page) : null;
  await profiler?.send("Profiler.enable");
  await profiler?.send("Profiler.start");
  const cadence = await preview
    .locator(".motion-template-preview-canvas")
    .evaluate(async (host) => {
      const times: number[] = [],
        clocks: number[] = [];
      let resizeWrites = 0;
      const resize = new MutationObserver((records) => {
        resizeWrites += records.filter(
          (record) => (record.target as Element).tagName === "CANVAS",
        ).length;
      });
      resize.observe(host, {
        subtree: true,
        attributes: true,
        attributeFilter: ["width", "height"],
      });
      const observer = new MutationObserver(() => {
        times.push(performance.now());
        clocks.push(Number((host as HTMLElement).dataset.previewTime));
      });
      observer.observe(host, { attributes: true, attributeFilter: ["data-preview-time"] });
      await new Promise((resolve) => setTimeout(resolve, 3200));
      observer.disconnect();
      resize.disconnect();
      const gaps = times.slice(1).map((time, index) => time - times[index]!);
      const sorted = [...gaps].sort((a, b) => a - b);
      return {
        frames: times.length,
        resizeWrites,
        gapP95: sorted[Math.floor(sorted.length * 0.95)] ?? null,
        gapMax: Math.max(0, ...gaps),
        times,
        clocks,
      };
    });
  await mkdir("artifacts/bloom-windows", { recursive: true });
  if (profiler) {
    const { profile } = await profiler.send("Profiler.stop");
    await writeFile("artifacts/bloom-windows/hover.cpuprofile", JSON.stringify(profile));
    await profiler.detach();
  }
  await writeFile("artifacts/bloom-windows/hover-cadence.json", JSON.stringify(cadence, null, 2));
  expect(cadence.resizeWrites).toBe(0);
  expect(cadence.frames).toBeGreaterThan(40);
  expect(cadence.gapP95).not.toBeNull();
  expect(cadence.gapP95!).toBeLessThan(100);
  expect(new Set(cadence.clocks).size).toBe(cadence.frames);
  expect(cadence.clocks[0]!).toBeGreaterThanOrEqual(0);
  expect(cadence.clocks.at(-1)! - cadence.clocks[0]!).toBeLessThan(3.5);
  expect(requests.some((url) => url.includes("bloom-windows.preview.json"))).toBe(true);
  expect(requests.some((url) => url.includes("bloom-windows-hover.mp4"))).toBe(true);
  expect(requests.some((url) => url.includes("bloom-windows-loop.mp4"))).toBe(false);
  await checkBloomBackdrop(preview.locator("canvas"), "artifacts/bloom-flicker/hover-display");
  await page.locator(".dashboard-brand").hover();
  await expect(preview).toHaveAttribute("data-preview-status", "idle");
  await expect(preview.locator("canvas")).toHaveCount(0);
});
