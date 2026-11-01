import { test, expect } from "@playwright/test";
import { createLayer, createPage, createProject, createEffect } from "@musart/core";

test("timeline collapse and effect popovers preserve ongoing playback", async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  const layer = createLayer("rectangle", {
    id: "moving",
    x: 10,
    y: 10,
    width: 40,
    height: 40,
    effects: [
      createEffect("window-trails", { id: "trail", settings: { count: 2 } }),
      createEffect("time-warp-scan", { id: "retired-scan" }),
    ],
  });
  const project = createProject({
    pages: [
      createPage({
        id: "playing",
        width: 320,
        height: 180,
        layers: [layer],
        motion: {
          version: 1,
          initialized: true,
          mode: "motion",
          duration: { value: 10, rate: 1 },
          frameRate: { numerator: 30, denominator: 1 },
          tracks: [
            {
              id: "track",
              layerId: layer.id,
              start: { value: 0, rate: 1 },
              end: null,
              properties: [
                {
                  id: "x",
                  target: { kind: "layer", layerId: layer.id, property: "x" },
                  keyframes: [
                    { id: "a", time: { value: 0, rate: 1 }, value: 10 },
                    { id: "b", time: { value: 10, rate: 1 }, value: 200 },
                  ],
                },
              ],
            },
          ],
        },
      }),
    ],
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => window.musart!.load(project), project);
  const dock = page.locator(".motion-timeline-dock");
  const toggle = page.locator(".canvas-timeline-toggle");
  await page.getByRole("button", { name: "Pin timeline", exact: true }).click();
  await expect(dock).toHaveAttribute("data-motion-expanded", "true");
  const play = page.locator(".motion-transport").getByRole("button", { name: "Play", exact: true });
  await play.click();
  const pause = page
    .locator(".motion-transport")
    .getByRole("button", { name: "Pause", exact: true });
  await expect(pause).toBeVisible();
  const playhead = page.locator(".motion-playhead").first();
  const before = await playhead.getAttribute("style");
  await expect.poll(() => playhead.getAttribute("style")).not.toBe(before);
  await toggle.click();
  await page.mouse.move(400, 100);
  await expect(dock).toHaveAttribute("data-motion-expanded", "false");
  const closed = await playhead.getAttribute("style");
  await expect.poll(() => playhead.getAttribute("style")).not.toBe(closed);
  await page.getByRole("button", { name: "Pin timeline", exact: true }).click();
  await expect(pause).toBeVisible();
  await page.locator('[data-attachment-effect-id="trail"]').click();
  const effectPanel = page.getByRole("dialog", { name: /Effects/ });
  await expect(effectPanel).toBeVisible();
  await expect(effectPanel).toBeFocused();
  await expect(page.locator('[data-attachment-effect-id="retired-scan"]')).toHaveCount(0);
  await expect(pause).toBeAttached();
  const opening = await playhead.getAttribute("style");
  await expect.poll(() => playhead.getAttribute("style")).not.toBe(opening);
  await page.keyboard.press("Tab");
  await expect(play).toBeAttached();
  await page.keyboard.press("Escape");
  await play.click();
  await page.locator('[data-attachment-effect-id="trail"]').click();
  await expect(effectPanel).toBeFocused();
  await expect(pause).toBeAttached();
  await page.keyboard.press("Escape");
  await pause.click();
  expect((await page.evaluate(() => window.musart!.snapshot())).project).toEqual(project);
});
