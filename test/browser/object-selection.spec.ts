import { expect, test } from "@playwright/test";
import { objectSelectionFixture } from "./support/object-selection-fixture";
import { installReadbackProbe } from "./support/readback-probe";
test.use({ channel: "chromium", trace: "off" });
test("one-click background removal commits once; optional SAM refinement recovers pixels outside the first matte", async ({
  page,
  context,
}) => {
  await installReadbackProbe(page);
  await objectSelectionFixture(page);
  const before = await page.evaluate(() => window.musart!.snapshot());
  await page.getByRole("button", { name: "Remove background", exact: true }).click();
  const panel = page.locator('.tool-settings[data-tool="segment"]');
  await expect(panel.getByRole("button", { name: "Refine", exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(document.documentElement.dataset.modelRequests!)),
  ).toEqual(["background"]);
  expect((await page.evaluate(() => window.musart!.snapshot())).revision).toBe(before.revision + 1);
  expect(await panel.evaluate((node) => node.getBoundingClientRect().height)).toBeLessThan(180);
  await expect(panel.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByTestId("object-selection-surface")).not.toBeVisible();
  const automatic = await page.evaluate(() => window.musart!.snapshot().project);
  await panel.getByRole("button", { name: "Refine", exact: true }).click();
  const surface = page.getByTestId("object-selection-surface");
  await expect(surface.locator(".object-selection-hit")).toHaveCount(1);
  await surface.click({ position: { x: 10, y: 10 } });
  expect((await page.evaluate(() => window.musart!.snapshot())).selection).toEqual([
    "object-image",
  ]);
  const bounds = (await surface.locator(".object-selection-hit").boundingBox())!;
  const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.mouse.click(point.x, point.y);
  await expect(panel.getByRole("button", { name: "Apply mask", exact: true })).toBeEnabled();
  const counters = () =>
    page
      .locator(".musart-app, .inspector, .canvas-area, .editor-canvas, .editor-gpu-scene")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-react-renders")));
  const counts = await counters();
  await page.mouse.click(point.x, point.y, { button: "right" });
  await expect(surface.locator(".object-point-negative")).toHaveCount(1);
  expect(await counters()).toEqual(counts);
  await panel.getByRole("button", { name: "Remove last hint", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Apply mask", exact: true })).toBeEnabled();
  await panel.getByRole("button", { name: "Apply mask", exact: true }).click();
  const url = await page.evaluate(() => window.musart!.render({ format: "png" })),
    inspector = await context.newPage();
  try {
    const alpha = await inspector.evaluate(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      return [64, 128, 192].map((x) => ctx.getImageData(x, 96, 1, 1).data[3]);
    }, url);
    expect(alpha).toEqual([0, 255, 255]);
  } finally {
    await inspector.close();
  }
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
  });
  const refined = await page.evaluate(() => window.musart!.snapshot().project);
  await page.evaluate(() => window.musart!.undo());
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(automatic);
  await page.evaluate(() => window.musart!.undo());
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before.project);
  await page.evaluate(() => {
    window.musart!.redo();
    window.musart!.redo();
  });
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(refined);
});

for (const workspace of ["classic", "studio"] as const)
  test(`refinement infers a point or rectangle and reserves secondary clicks for exclusion (${workspace})`, async ({
    page,
  }) => {
    await objectSelectionFixture(page, 40, workspace);
    await page.getByTestId("editor-canvas").focus();
    await page.keyboard.press("s");
    await page.getByRole("button", { name: "Refine", exact: true }).click();
    const surface = page.getByTestId("object-selection-surface");
    const hit = surface.locator('[data-layer-id="object-image"] .object-selection-hit');
    const bounds = (await hit.boundingBox())!;
    const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const before = await page.evaluate(() => {
      const data = document.querySelector<HTMLElement>('[data-testid="artboard"]')!.dataset;
      return {
        project: window.musart!.snapshot().project,
        selection: window.musart!.snapshot().selection,
        view: { zoom: data.zoom, panX: data.panX, panY: data.panY },
      };
    });
    const prompt = () =>
      page.evaluate(() => JSON.parse(document.documentElement.dataset.objectPrompt ?? "{}"));
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 2, point.y + 1);
    await page.mouse.up();
    await expect.poll(async () => (await prompt()).points?.length).toBe(1);
    expect((await prompt()).box).toBeUndefined();
    await expect(page.getByRole("button", { name: "Apply mask", exact: true })).toBeEnabled();

    await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.8, {
      steps: 5,
    });
    const during = await prompt();
    expect(during.box).toBeUndefined();
    await page.mouse.up();
    await expect.poll(async () => (await prompt()).box).toBeTruthy();
    expect((await prompt()).points).toEqual([]);
    await expect(page.getByRole("button", { name: "Apply mask", exact: true })).toBeEnabled();
    await page.mouse.click(point.x, point.y, { button: "right" });
    await expect.poll(async () => (await prompt()).points?.[0]?.label).toBe(0);
    expect((await prompt()).box).toBeTruthy();
    await expect(surface.locator(".object-point-negative")).toHaveCount(1);
    await expect(page.getByRole("menu")).toHaveCount(0);
    expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before.project);
    expect(await page.evaluate(() => window.musart!.snapshot().selection)).toEqual(
      before.selection,
    );
    const view = await page.locator('[data-testid="artboard"]').evaluate((node) => {
      const data = (node as HTMLElement).dataset;
      return { zoom: data.zoom, panX: data.panX, panY: data.panY };
    });
    for (const key of ["zoom", "panX", "panY"] as const) expect(view[key]).toBe(before.view[key]);
    await expect(page.locator('.tool-settings[data-tool="segment"] [role="combobox"]')).toHaveCount(
      0,
    );
  });
