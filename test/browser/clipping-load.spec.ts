import { expect, test } from "@playwright/test";
import { createLayer } from "@musart/core";
import { writeFile } from "node:fs/promises";
import { libraryStressProject } from "./support/library-stress";
import { libraryFrame, libraryPng } from "./support/library-observer";
import { contactSheetRegions, inspectImage } from "./support/image-probe";
import { installReadbackProbe } from "./support/readback-probe";

test("clipping retains real effects and exact undo under the fifty-image workload", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(180000);
  const fixture = await libraryStressProject(),
    board = fixture.project.pages[0]!,
    image = board.layers.find((layer) => layer.id === "stress-image-0")!,
    base = createLayer("ellipse", {
      id: "clipping-load-base",
      parentId: image.parentId,
      x: image.x,
      y: image.y,
      width: image.width,
      height: image.height,
      fill: "#ffffff",
    });
  board.layers.splice(board.layers.indexOf(image), 0, base);
  expect(board.layers.filter((layer) => layer.kind === "image")).toHaveLength(50);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "en");
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["stress-image-0"]);
  }, fixture.project);
  const inspector = await context.newPage();
  await page.bringToFront();
  try {
    const before = await libraryFrame(page, fixture.project.id),
      png = await libraryPng(page),
      original = await inspectImage(page, png, contactSheetRegions, inspector);
    await page.keyboard.press("Control+Alt+g");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window
              .musart!.snapshot()
              .project.pages[0]!.layers.find((layer) => layer.id === "stress-image-0")!.clipping,
        ),
      )
      .toEqual({ layerId: base.id });
    const clipped = await libraryFrame(page, fixture.project.id, before.renders),
      after = await inspectImage(page, await libraryPng(page), contactSheetRegions, inspector);
    expect(after.regions[0]!.hash).not.toBe(original.regions[0]!.hash);
    expect(after.regions.slice(1)).toEqual(original.regions.slice(1));
    expect(clipped.cacheBytes).toBeLessThanOrEqual(clipped.maxBytes);
    await page.keyboard.press("Control+z");
    const restored = await libraryFrame(page, fixture.project.id, clipped.renders);
    expect(
      (await inspectImage(page, await libraryPng(page), contactSheetRegions, inspector)).regions,
    ).toEqual(original.regions);
    expect(restored.cacheBytes).toBeLessThanOrEqual(restored.maxBytes);
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
    const environment = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      dpr: devicePixelRatio,
      viewport: [innerWidth, innerHeight],
      backend: document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset
        .backend,
    }));
    await writeFile(
      "artifacts/photoshop-shortcuts/clipping-50.json",
      JSON.stringify(
        {
          boundary:
            "Functional real-image rendering and resource bounds; development build, no latency claim.",
          browser: browser.version(),
          environment,
          before,
          clipped,
          restored,
          errors,
        },
        null,
        2,
      ),
    );
    expect(errors).toEqual([]);
  } finally {
    await inspector.close();
  }
});
