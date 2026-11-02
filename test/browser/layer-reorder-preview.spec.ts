import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";
import { installNativeDragProbe, assertNativeMove } from "./support/native-drag";
import { inspectImage } from "./support/image-probe";

const surfaces = [
  ".musart-app",
  ".inspector",
  ".canvas-area",
  ".editor-canvas",
  ".editor-gpu-scene",
];
const settle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

test("native Layers reorder changes visible stacking while held, with stationary rows and one undo", async ({
  page,
}, testInfo) => {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      pages: [
        createPage({
          id: "held-order-board",
          width: 400,
          height: 300,
          background: "#ffffff",
          layers: [
            createLayer("rectangle", {
              id: "order-blue",
              name: "Blue background",
              x: 0,
              y: 0,
              width: 400,
              height: 300,
              fill: "#0000ff",
            }),
            createLayer("rectangle", {
              id: "order-red",
              name: "Red foreground",
              x: 0,
              y: 0,
              width: 400,
              height: 300,
              fill: "#ff0000",
            }),
          ],
        }),
      ],
    }),
  );
  const canvas = page.locator(
    'canvas[data-page-id="held-order-board"][data-renderer-ready="true"]',
  );
  await expect(canvas).toBeVisible();
  const board = page.getByTestId("artboard");
  await expect(board).toHaveAttribute("data-view-moving", "false");
  const source = page.locator('.layer-row[data-layer-id="order-red"]');
  const target = page.locator('.layer-row[data-layer-id="order-blue"]');
  await source.locator(".layer-name").click();
  await settle(page);
  const snapshot = () =>
    page.evaluate(() => {
      const value = window.musart!.snapshot();
      return { project: value.project, canUndo: value.canUndo };
    });
  const commits = () =>
    page.evaluate(
      (selectors) =>
        Object.fromEntries(
          selectors.map((selector) => {
            const counter = document.querySelector<HTMLElement>(selector)?.dataset.reactRenders;
            if (counter === undefined) throw new Error(`Missing actual React counter: ${selector}`);
            return [selector, Number(counter)];
          }),
        ),
      surfaces,
    );
  const rows = () =>
    page.locator(".layer-row[data-layer-id]").evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return {
          id: (node as HTMLElement).dataset.layerId,
          x: box.x,
          y: box.y,
          height: box.height,
        };
      }),
    );
  const bounds = (await board.boundingBox())!;
  const clip = {
    x: bounds.x + bounds.width * 0.4,
    y: bounds.y + bounds.height * 0.4,
    width: bounds.width * 0.2,
    height: bounds.height * 0.2,
  };
  const capture = () => page.screenshot({ clip });
  const before = await snapshot();
  const canonicalRows = await rows();
  const baseline = await commits();
  const originalPixels = await capture();
  await installNativeDragProbe(page, "application/x-musart-layer");

  async function holdBehind() {
    const rendered = Number(await canvas.getAttribute("data-render-count"));
    await page.evaluate(() => {
      delete document.documentElement.dataset.layerReorderLatency;
      const capture = (event: DragEvent) => {
        if (
          !(event.target instanceof Element) ||
          !event.target.closest('[data-layer-id="order-blue"]')
        )
          return;
        document.removeEventListener("dragover", capture, true);
        const generatedAt = event.timeStamp;
        const dispatchAt = performance.now();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const secondRafAt = performance.now();
            document.documentElement.dataset.layerReorderLatency = JSON.stringify({
              generatedAt,
              dispatchAt,
              secondRafAt,
              inputToSecondRafMs: secondRafAt - generatedAt,
            });
          }),
        );
      };
      document.addEventListener("dragover", capture, true);
    });
    const from = (await source.boundingBox())!,
      to = (await target.boundingBox())!;
    // Label-side lower edge avoids the thumbnail mask target and inserts behind blue.
    await page.mouse.move(from.x + 110, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 118, from.y + from.height / 2, { steps: 3 });
    await page.mouse.move(to.x + 110, to.y + to.height - 3, { steps: 8 });
    await page.mouse.move(to.x + 111, to.y + to.height - 3);
    await expect(page.locator("html")).toHaveAttribute("data-layer-reorder-active", "true");
    await page.waitForFunction(() => Boolean(document.documentElement.dataset.layerReorderLatency));
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-render-count")))
      .toBeGreaterThan(rendered);
    await settle(page);
  }

  await holdBehind();
  const heldPixels = await capture();
  await testInfo.attach("canonical-canvas-pixels", {
    body: originalPixels,
    contentType: "image/png",
  });
  await testInfo.attach("held-reorder-canvas-pixels", {
    body: heldPixels,
    contentType: "image/png",
  });
  expect(await snapshot()).toEqual(before);
  expect(await rows()).toEqual(canonicalRows);
  expect(await commits()).toEqual(baseline);
  const timing = await page.evaluate(
    () =>
      JSON.parse(document.documentElement.dataset.layerReorderLatency!) as {
        generatedAt: number;
        dispatchAt: number;
        secondRafAt: number;
        inputToSecondRafMs: number;
      },
  );
  expect(timing.generatedAt).toBeGreaterThan(0);
  expect(timing.secondRafAt).toBeGreaterThanOrEqual(timing.dispatchAt);
  expect(timing.inputToSecondRafMs).toBeGreaterThanOrEqual(0);
  await testInfo.attach("native-layer-reorder-input-to-second-raf", {
    body: JSON.stringify({ ...timing, browser: page.context().browser()!.version() }, null, 2),
    contentType: "application/json",
  });
  await page.mouse.up();
  await assertNativeMove(page, "order-red");
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.musart!.snapshot().project.pages[0]!.layers.map((layer) => layer.id),
      ),
    )
    .toEqual(["order-red", "order-blue"]);
  expect((await snapshot()).canUndo).toBe(true);
  await page.keyboard.press("Control+z");
  await expect.poll(snapshot).toEqual(before);
  await settle(page);
  const undonePixels = await capture();
  const cancelBaseline = await commits();
  await holdBehind();
  const heldAgainPixels = await capture();
  expect(await rows()).toEqual(canonicalRows);
  expect(await commits()).toEqual(cancelBaseline);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator("html")).not.toHaveAttribute("data-layer-reorder-active", "true");
  await settle(page);
  const canceledPixels = await capture();
  expect(await snapshot()).toEqual(before);
  // Decode genuine screenshots after native input ends so the inspector tab cannot interrupt it.
  const hashes: number[] = [];
  for (const pixels of [
    originalPixels,
    heldPixels,
    undonePixels,
    heldAgainPixels,
    canceledPixels,
  ]) {
    const image = await inspectImage(page, pixels, [{ x: 0, y: 0, width: 1, height: 1 }]);
    hashes.push(image.regions[0]!.hash);
  }
  expect(hashes[1]).not.toBe(hashes[0]);
  expect(hashes[2]).toBe(hashes[0]);
  expect(hashes[3]).toBe(hashes[1]);
  expect(hashes[4]).toBe(hashes[0]);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});
