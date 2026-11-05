import { expect, test } from "@playwright/test";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
} from "@musart/core";

test("Classic native text handles, hover and mode chip share prepared ink and commit one scale gesture", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem(
      "musart.snapping.v1",
      JSON.stringify({ version: 1, enabled: false, threshold: 6 }),
    );
  });
  await page.goto("/editor?automation=1&workspace=classic");
  await page.waitForFunction(() => !!window.musart);
  const spatial = createSpatialScene();
  spatial.camera = { ...spatial.camera, projection: "orthographic", yaw: 0, pitch: 0 };
  const title = createLayer("text", {
    id: "native-title",
    name: "Native title",
    text: "Melt",
    x: 80,
    y: 150,
    width: 420,
    height: 160,
    fontSize: 70,
    fontFamily: "Inter Variable",
    fill: "#6d28d9",
    spatial: { ...createSpatialLayer("extrude"), depth: 0.12, bevel: 0.01 },
  });
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["native-title"]);
    },
    createProject({
      pages: [createPage({ id: "ink-frame", width: 640, height: 480, spatial, layers: [title] })],
    }),
  );
  const canvas = page.locator(".editor-gpu-scene canvas"),
    selection = page.locator('.canvas-selection[data-layer-id="native-title"]'),
    chip = page.locator(".canvas-object-toolbar-anchor"),
    artboard = page.getByTestId("artboard");
  await expect(canvas).toHaveAttribute("data-page-id", "ink-frame", { timeout: 40000 });
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true", { timeout: 40000 });
  await expect
    .poll(async () =>
      parseFloat(await selection.evaluate((node) => (node as HTMLElement).style.width)),
    )
    .toBeLessThan(300);
  const selectedBox = (await selection.boundingBox())!,
    stage = (await artboard.boundingBox())!;
  expect(selectedBox.width).toBeLessThan(stage.width * 0.5);
  expect(selectedBox.height).toBeLessThan(stage.height * 0.25);
  const chipBox = (await chip.boundingBox())!;
  expect(
    Math.abs(chipBox.x + chipBox.width / 2 - (selectedBox.x + selectedBox.width / 2)),
  ).toBeLessThan(2);
  expect(chipBox.y).toBeLessThan(selectedBox.y);
  expect(selectedBox.y - chipBox.y).toBeLessThan(90);
  const original = await page.evaluate(() => window.musart!.snapshot());
  const handle = page.locator('.canvas-handle[data-layer-id="native-title"][data-handle="se"]');
  const grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.keyboard.down("Alt");
  await page.mouse.move(grip.x + grip.width / 2 + 35, grip.y + grip.height / 2 + 15, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true", { timeout: 40000 });
  const after = await page.evaluate(() => window.musart!.snapshot()),
    next = after.project.pages[0]!.layers[0]!;
  expect(after.revision).toBe(original.revision + 1);
  expect(next).toMatchObject({
    width: title.width,
    height: title.height,
    fontSize: title.fontSize,
    text: title.text,
    spatial: title.spatial,
  });
  expect(next.scaleX).toBeGreaterThan(1);
  expect(next.scaleY).toBeGreaterThan(1);
  const resized = (await selection.boundingBox())!;
  expect(resized.x).toBeCloseTo(selectedBox.x, 0);
  expect(resized.y).toBeCloseTo(selectedBox.y, 0);
  expect(resized.width - selectedBox.width).toBeCloseTo(35, 0);
  expect(resized.height - selectedBox.height).toBeCloseTo(15, 0);
  await page.evaluate(() => window.musart!.undo());
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(original.project);
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true", { timeout: 40000 });
  const ink = await page.evaluate(async () => {
    const modulePath = "/src/canvas/selection/hit.ts";
    const { canvasHit } = await import(/* @vite-ignore */ modulePath);
    const current = window.musart!.snapshot().project.pages[0]!;
    window.musart!.select([]);
    for (let y = 120; y < 320; y += 4)
      for (let x = 60; x < 500; x += 4)
        if (canvasHit(current, { x, y }, true)?.layer.id === "native-title") return { x, y };
    throw Error("Native glyph ink was not pickable");
  });
  await page.mouse.move(
    stage.x + (ink.x * stage.width) / 640,
    stage.y + (ink.y * stage.height) / 480,
  );
  const hover = page.locator('.canvas-timeline-hover[data-layer-id="native-title"]');
  await expect(hover).toBeVisible();
  const hoverBox = (await hover.boundingBox())!;
  expect(hoverBox.x).toBeCloseTo(selectedBox.x, 0);
  expect(hoverBox.y).toBeCloseTo(selectedBox.y, 0);
  expect(hoverBox.width).toBeCloseTo(selectedBox.width, 0);
  expect(hoverBox.height).toBeCloseTo(selectedBox.height, 0);
  await page.evaluate(() => window.musart!.select(["native-title"]));
  await page.screenshot({ path: "artifacts/classic-spatial-selection-frame.png" });
});
