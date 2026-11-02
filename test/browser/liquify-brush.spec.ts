import { expect, test } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";
const surfaces = [
  ".musart-app",
  ".inspector",
  ".canvas-area",
  ".editor-canvas",
  ".editor-gpu-scene",
];
test("round Liquify brush previews without root commits, cancels, commits once and resets with undo", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const effect = createEffect("liquify"),
    layer = createLayer("image", {
      id: "brush-image",
      assetId: "source",
      x: 32,
      y: 32,
      width: 192,
      height: 192,
      effects: [effect],
    });
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192"><rect width="192" height="192" fill="#f0c040"/><path d="M0 80H192V112H0Z M80 0H112V192H80Z" fill="#1760df"/><circle cx="96" cy="96" r="30" fill="#f03050"/></svg>';
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["brush-image"]);
    },
    createProject({
      id: "native-liquify",
      assets: {
        source: {
          id: "source",
          name: "Calibration",
          mime: "image/svg+xml",
          width: 192,
          height: 192,
          dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
        },
      },
      pages: [createPage({ width: 256, height: 256, layers: [layer] })],
    }),
  );
  const ready = () =>
    page.waitForFunction(() => {
      const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
      return (
        data?.rendererReady === "true" &&
        data.projectId === window.musart!.session().projectId &&
        Number(data.canonicalRevision) === window.musart!.session().revision
      );
    });
  await ready();
  await page
    .locator(`[data-layer-id="brush-image"] [data-attachment-effect-id="${effect.id}"]`)
    .click();
  const brush = page.locator(".liquify-brush");
  await expect(brush).toBeVisible();
  const state = () =>
    page.evaluate(() => {
      const s = window.musart!.snapshot();
      return { revision: s.revision, effect: s.project.pages[0]!.layers[0]!.effects[0]! };
    });
  const before = await state(),
    board = (await page.getByTestId("artboard").boundingBox())!;
  const zoom = Number(await page.getByTestId("artboard").getAttribute("data-zoom"));
  const start = { x: board.x + 112 * zoom, y: board.y + 112 * zoom };
  await page.mouse.move(start.x, start.y);
  const rootCounts = () =>
    page.evaluate(
      (selectors) =>
        selectors.map(
          (selector) => document.querySelector<HTMLElement>(selector)?.dataset.reactRenders,
        ),
      surfaces,
    );
  const counts = await rootCounts();
  expect(counts.every((value) => value !== undefined && Number.isFinite(Number(value)))).toBe(true);
  const canvas = page.locator(".editor-gpu-scene canvas"),
    renders = Number(await canvas.getAttribute("data-render-count"));
  const pixels = () =>
    canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL("image/png"));
  const originalPixels = await pixels();
  await page.mouse.down();
  await page.mouse.move(start.x + 48 * zoom, start.y + 20 * zoom, { steps: 12 });
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-render-count")))
    .toBeGreaterThan(renders);
  expect(await pixels()).not.toBe(originalPixels);
  expect(await rootCounts()).toEqual(counts);
  expect((await state()).revision).toBe(before.revision);
  await page.mouse.up();
  await ready();
  const committed = await state();
  const committedPixels = await pixels();
  expect(committed.revision).toBe(before.revision + 1);
  expect(committed.effect.liquify!.length).toBeGreaterThan(0);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 32 * zoom, start.y - 24 * zoom, { steps: 8 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await ready();
  expect(await state()).toEqual(committed);
  expect(await pixels()).toBe(committedPixels);
  await page.evaluate(() => window.musart!.undo());
  await ready();
  expect((await state()).effect.liquify).toBeUndefined();
  await page.evaluate(() => window.musart!.redo());
  await ready();
  expect((await state()).effect.liquify).toEqual(committed.effect.liquify);
  // History intentionally guards stale row actions until its post-draw presentation is admitted.
  await expect(page.locator("[data-layers-presentation]")).toHaveAttribute("aria-busy", "false");
  const trigger = page.locator(
    `[data-layer-id="brush-image"] [data-attachment-effect-id="${effect.id}"]`,
  );
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
  await expect(page.getByRole("button", { name: "Reset deformation", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset deformation", exact: true }).click();
  await ready();
  expect((await state()).effect.liquify).toEqual([]);
  expect(await pixels()).toBe(originalPixels);
  await page.evaluate(() => window.musart!.undo());
  await ready();
  expect((await state()).effect.liquify).toEqual(committed.effect.liquify);
  await brush.focus();
  await page.keyboard.press("Escape");
  await expect(brush).not.toBeVisible();
  expect(await page.evaluate(() => window.musart!.session().selection)).toEqual(["brush-image"]);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
  });
  expect(errors).toEqual([]);
});
