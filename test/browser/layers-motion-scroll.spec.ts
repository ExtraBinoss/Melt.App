import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";

test("the final layer remains fully visible and clickable above the Motion peek at different heights", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.language", "en");
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const layers = Array.from({ length: 40 }, (_, i) =>
    createLayer("rectangle", {
      id: `scroll-layer-${i}`,
      name: `Layer ${i}`,
      width: 20,
      height: 20,
      x: (i % 10) * 25,
      y: Math.floor(i / 10) * 25,
    }),
  );
  const project = createProject({
    pages: [
      createPage({
        id: "scroll-page",
        width: 300,
        height: 200,
        layers,
        motion: {
          version: 1,
          initialized: true,
          mode: "motion",
          duration: { value: 8, rate: 1 },
          frameRate: { numerator: 60, denominator: 1 },
          tracks: layers.map((l) => ({
            id: `track-${l.id}`,
            layerId: l.id,
            start: { value: 0, rate: 1 },
            end: null,
            properties: [],
          })),
        },
      }),
    ],
  });
  await page.evaluate((project) => window.musart!.load(project), project);
  const tree = page.locator(".layer-tree");
  const dock = page.locator(".motion-timeline-dock");
  await expect(dock).toHaveAttribute("data-motion-presence", "peek");
  for (const height of [720, 560, 900]) {
    await page.setViewportSize({ width: 1280, height });
    await tree.hover({ position: { x: 100, y: 20 } });
    await page.mouse.wheel(0, 10000);
    const last = tree.locator('[data-layer-id="scroll-layer-0"]');
    await expect(last).toBeVisible();
    await expect
      .poll(async () => {
        const row = (await last.boundingBox())!;
        const ruler = (await page.locator(".motion-ruler").boundingBox())!;
        return row.y + row.height <= ruler.y + 1;
      })
      .toBe(true);
    await last.locator(".layer-name").click();
    await expect
      .poll(() => page.evaluate(() => window.musart!.session().selection))
      .toEqual(["scroll-layer-0"]);
  }
  await page.locator(".canvas-timeline-toggle").click();
  await page.getByRole("button", { name: "Pin timeline", exact: true }).click();
  await expect(dock).toHaveAttribute("data-motion-pinned", "true");
  await expect(dock).not.toHaveAttribute("data-motion-animating");
  await expect(page.locator(".layers-panel")).toHaveCSS("padding-bottom", "0px");
  await tree.hover({ position: { x: 100, y: 20 } });
  await page.mouse.wheel(0, 10000);
  await tree.locator('[data-layer-id="scroll-layer-0"] .layer-name').click();
  await page.evaluate(() => window.musart!.execute({ type: "setCompositionMode", mode: "static" }));
  await expect(page.locator('.motion-timeline-dock:not([data-motion-exiting="true"])')).toHaveCount(
    0,
  );
  await expect(page.locator(".layers-panel")).toHaveCSS("padding-bottom", "0px");
  await tree.hover({ position: { x: 100, y: 20 } });
  await page.mouse.wheel(0, 10000);
  await tree.locator('[data-layer-id="scroll-layer-0"] .layer-name').click();
});
