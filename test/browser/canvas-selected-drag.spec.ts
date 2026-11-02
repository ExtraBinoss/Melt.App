import { expect, test } from "@playwright/test";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
} from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket("**", () => {});
});

test("Layers-selected artwork keeps its canvas drag target through overlap with one undo and cancel", async ({
  page,
}) => {
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
          id: "selected-drag-board",
          width: 500,
          height: 300,
          layers: [
            createLayer("ellipse", {
              id: "selected-drag-shape",
              name: "Selected circle",
              x: 40,
              y: 40,
              width: 120,
              height: 120,
            }),
            createLayer("group", {
              id: "selected-drag-group",
              name: "Selected group",
              x: 240,
              y: 40,
              width: 140,
              height: 140,
            }),
            createLayer("rectangle", {
              id: "selected-drag-front",
              name: "Foreground",
              x: 0,
              y: 0,
              width: 500,
              height: 300,
              fill: "#ff6666",
            }),
            createLayer("rectangle", {
              id: "selected-drag-child",
              parentId: "selected-drag-group",
              x: 10,
              y: 10,
              width: 100,
              height: 100,
            }),
          ],
        }),
      ],
    }),
  );
  await expect(
    page.locator('canvas[data-page-id="selected-drag-board"][data-renderer-ready="true"]'),
  ).toBeVisible();
  const board = page.getByTestId("artboard");
  await expect(board).toHaveAttribute("data-view-moving", "false");
  const box = (await board.boundingBox())!,
    zoom = box.width / 500;
  const at = (x: number, y: number) => ({ x: box.x + x * zoom, y: box.y + y * zoom });
  const read = () => page.evaluate(() => window.musart!.snapshot());
  const counters = () =>
    page.evaluate(() =>
      Object.fromEntries(
        [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
          (selector) => [
            selector,
            document.querySelector<HTMLElement>(selector)?.dataset.reactRenders,
          ],
        ),
      ),
    );
  // The foreground root remains above a background group's child even when the
  // child's flat document position follows that root.
  await page.mouse.click(at(290, 90).x, at(290, 90).y);
  expect((await read()).selection).toEqual(["selected-drag-front"]);

  for (const [id, x, y] of [
    ["selected-drag-shape", 100, 100],
    ["selected-drag-group", 290, 90],
  ] as const) {
    await page.locator(`.layer-row[data-layer-id="${id}"] .layer-name`).click();
    await expect(page.getByRole("region", { name: "Properties", exact: true })).toHaveAttribute(
      "data-selected-layer-id",
      id,
    );
    expect((await read()).selection).toEqual([id]);
    const before = await read(),
      baseline = await counters(),
      point = at(x, y);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 30 * zoom, point.y + 20 * zoom, { steps: 5 });
    expect((await read()).project).toEqual(before.project);
    expect(await counters()).toEqual(baseline);
    await page.mouse.up();
    const after = await read();
    expect(after.selection).toEqual([id]);
    expect(after.revision).toBe(before.revision + 1);
    const original = before.project.pages[0]!.layers.find((layer) => layer.id === id)!;
    const moved = after.project.pages[0]!.layers.find((layer) => layer.id === id)!;
    expect(moved.x).toBeCloseTo(original.x + 30, 0);
    expect(moved.y).toBeCloseTo(original.y + 20, 0);
    expect(
      after.project.pages[0]!.layers.find((layer) => layer.id === "selected-drag-front"),
    ).toEqual(before.project.pages[0]!.layers.find((layer) => layer.id === "selected-drag-front"));
    await page.evaluate(() => window.musart!.undo());
    expect((await read()).project).toEqual(before.project);
    expect((await read()).canUndo).toBe(false);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 40, point.y + 30, { steps: 4 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect((await read()).project).toEqual(before.project);
    expect((await read()).canUndo).toBe(false);
  }
  await page.locator('.layer-row[data-layer-id="selected-drag-shape"] .layer-name').click();
  // A selected ellipse's empty corner grants no selection rectangle hit.
  // Stay outside both the ellipse and its intentional corner resize handle.
  await page.mouse.click(at(55, 55).x, at(55, 55).y);
  expect((await read()).selection).toEqual(["selected-drag-front"]);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});

test("a Layers-selected 3D mesh moves through 2D and nearer 3D foregrounds with one undo", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    // This witness checks exact drag targeting. Projected sphere/box edges can
    // legitimately attract the move inside the default six-pixel snap distance.
    localStorage.setItem(
      "musart.snapping.v1",
      JSON.stringify({ version: 1, enabled: false, threshold: 6 }),
    );
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  for (const nativeForeground of [false, true]) {
    const scene = createSpatialScene();
    scene.camera.yaw = 0;
    scene.camera.pitch = 0;
    scene.reflections = { mode: "environment", quality: "draft" };
    await page.evaluate(
      (project) => window.musart!.load(project),
      createProject({
        pages: [
          createPage({
            id: "selected-native-board",
            width: 500,
            height: 300,
            spatial: scene,
            layers: [
              createLayer("rectangle", {
                id: "selected-native-back",
                name: "Selected native sphere",
                x: 170,
                y: 70,
                width: 160,
                height: 160,
                spatial: { ...createSpatialLayer("sphere"), z: -0.3 },
              }),
              createLayer("rectangle", {
                id: "selected-native-front",
                name: "Foreground",
                x: nativeForeground ? 150 : 0,
                y: nativeForeground ? 50 : 0,
                width: nativeForeground ? 200 : 500,
                height: nativeForeground ? 200 : 300,
                ...(nativeForeground ? { spatial: { ...createSpatialLayer("box"), z: 0.5 } } : {}),
              }),
            ],
          }),
        ],
      }),
    );
    const canvas = page.locator('canvas[data-page-id="selected-native-board"]');
    await expect(canvas).toHaveAttribute("data-renderer-ready", "true");
    await expect(canvas).toHaveAttribute("data-presentation-ready", "true");
    const board = page.getByTestId("artboard");
    await expect(board).toHaveAttribute("data-view-moving", "false");
    const box = (await board.boundingBox())!,
      zoom = box.width / 500;
    const point = { x: box.x + 250 * zoom, y: box.y + 150 * zoom };
    await page.mouse.click(point.x, point.y);
    expect(await page.evaluate(() => window.musart!.snapshot().selection)).toEqual([
      "selected-native-front",
    ]);
    await page.locator('.layer-row[data-layer-id="selected-native-back"] .layer-name').click();
    const before = await page.evaluate(() => window.musart!.snapshot());
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 30 * zoom, point.y + 20 * zoom, { steps: 5 });
    await page.mouse.up();
    const after = await page.evaluate(() => window.musart!.snapshot());
    expect(after.selection).toEqual(["selected-native-back"]);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.project.pages[0]!.layers[0]!.x).toBeCloseTo(200, 0);
    expect(after.project.pages[0]!.layers[0]!.y).toBeCloseTo(90, 0);
    expect(after.project.pages[0]!.layers[1]).toEqual(before.project.pages[0]!.layers[1]);
    await page.evaluate(() => window.musart!.undo());
    expect((await page.evaluate(() => window.musart!.snapshot())).project).toEqual(before.project);
    expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
  }
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});
