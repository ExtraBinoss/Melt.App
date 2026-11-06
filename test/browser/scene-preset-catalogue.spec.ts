import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { preparePaletteProfile } from "./support/palette-profile";
import { searchSurfaceCounters } from "./support/search-profile";

test.use({ trace: "off", channel: "chromium" });
test("Studio camera and environment cards show neutral native previews with immediate loading feedback", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  await preparePaletteProfile(page, "studio", "cmdk");
  await page.evaluate(() => window.musart!.execute({ type: "setCompositionMode", mode: "motion" }));
  await page.locator(".studio-environment .studio-sphere-trigger").click();
  const settings = page.locator(".studio-sphere-content .studio-sphere-properties");
  const before = await page.evaluate(() => window.musart!.snapshot().project),
    timings = [];
  await mkdir("artifacts/scene-preset-preview/production", { recursive: true });
  for (const [owner, ids] of [
    ["camera", ["scene-camera-orbit", "scene-camera-push"]],
    ["environment", ["scene-environment-turn"]],
  ] as const) {
    await settings
      .locator(`[data-scene-animations="${owner}"] .scene-animations-heading button`)
      .click();
    const palette = page.locator(".motion-animation-popover");
    await expect(palette).toBeVisible();
    const counters = await searchSurfaceCounters(page);
    for (const id of ids) {
      const card = palette.locator(`[data-preset-id="${id}"]`);
      await expect(card.locator(".scene-animation-poster")).toBeVisible();
      await card.evaluate((node) => {
        node.addEventListener(
          "pointerenter",
          (event) => {
            (node as HTMLElement).dataset.nativeHoverAt = String(event.timeStamp);
          },
          { once: true },
        );
        const observer = new MutationObserver(() => {
          if (!node.querySelector(".animation-card-live canvas")) return;
          (node as HTMLElement).dataset.nativeReadyAt = String(performance.now());
          observer.disconnect();
        });
        observer.observe(node, { childList: true, subtree: true });
      });
      await card.hover();
      const canvas = card.locator(".animation-card-live canvas");
      await expect(canvas).toBeVisible({ timeout: 8000 });
      await expect(card.locator(".animation-card-live")).toHaveAttribute(
        "data-preview-state",
        "ready",
      );
      const first = await canvas.screenshot();
      await expect
        .poll(async () => Number(await canvas.getAttribute("data-preview-time")))
        .toBeGreaterThan(640);
      const moved = await canvas.screenshot();
      expect(first.equals(moved), id).toBe(false);
      timings.push(
        await card.evaluate((node) => ({
          id: (node as HTMLElement).dataset.presetId,
          hoverToCanvasMs:
            Number((node as HTMLElement).dataset.nativeReadyAt) -
            Number((node as HTMLElement).dataset.nativeHoverAt),
          componentToFirstFrameMs: Number(node.querySelector("canvas")?.dataset.previewReadyMs),
        })),
      );
      await writeFile(`artifacts/scene-preset-preview/production/${id}.png`, moved);
    }
    expect((await searchSurfaceCounters(page)).commits).toEqual(counters.commits);
    await page.keyboard.press("Escape");
    await expect(palette).toHaveCount(0);
  }
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before);
  await writeFile(
    "artifacts/scene-preset-preview/production/report.json",
    JSON.stringify({ browser: browser.version(), timings }, null, 2),
  );
});
