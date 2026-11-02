import { expect, test, type Page } from "@playwright/test";
import {
  createLayer,
  createPage,
  createProject,
  getWorldMatrix,
  transformPoint,
} from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";
const ready = (page: Page) =>
  page.waitForFunction(() => {
    const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
    return (
      data?.rendererReady === "true" &&
      data.projectId === window.musart!.session().projectId &&
      Number(data.canonicalRevision) === window.musart!.session().revision
    );
  });
test("copying pixels keeps an existing mask aligned under nested transforms without doubling parent opacity", async ({
  page,
  context,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const dataUrl = (svg: string) =>
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const source = {
    id: "source",
    name: "Regions",
    mime: "image/svg+xml",
    width: 96,
    height: 64,
    dataUrl: dataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64"><path fill="#e03040" d="M0 0h32v64H0z"/><path fill="#30c080" d="M32 0h32v64H32z"/><path fill="#3050e0" d="M64 0h32v64H64z"/></svg>',
    ),
  };
  const mask = {
    ...source,
    id: "clip",
    name: "Clip",
    dataUrl: dataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64"><path fill="white" d="M0 0h40v64H0z"/></svg>',
    ),
  };
  const parent = createLayer("group", {
    id: "parent",
    x: 60,
    y: 50,
    width: 220,
    height: 170,
    rotation: 12,
    scaleX: 1.1,
    opacity: 0.5,
    affine: [1, 0.15, 0.1, 1],
  });
  const original = createLayer("image", {
    id: "original",
    parentId: "parent",
    x: 10,
    y: 10,
    width: 192,
    height: 128,
    rotation: -7,
    scaleY: 0.9,
    opacity: 0.7,
    assetId: source.id,
    mask: { assetId: mask.id, enabled: true, inverted: false, mode: "alpha" },
  });
  const composition = createPage({
    width: 384,
    height: 288,
    background: "#00000000",
    layers: [parent, original],
  });
  const project = createProject({ pages: [composition], assets: { source, clip: mask } });
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["original"]);
  }, project);
  await ready(page);
  await page.getByRole("button", { name: "Magic wand", exact: true }).click();
  const tolerance = page.getByRole("textbox", { name: "Tolerance", exact: true });
  await tolerance.fill("0");
  await tolerance.press("Enter");
  const matrix = getWorldMatrix(composition, original.id),
    click = transformPoint(matrix, { x: 72, y: 64 }),
    board = (await page.getByTestId("artboard").boundingBox())!,
    zoom = Number(await page.getByTestId("artboard").getAttribute("data-zoom"));
  await page.mouse.click(board.x + click.x * zoom, board.y + click.y * zoom);
  const outline = page.getByTestId("pixel-selection-outline");
  await expect(outline).toHaveAttribute("data-selection-pixels", "2048");
  await expect(outline).toHaveAttribute("data-selection-dragging", "false");
  await page.getByRole("button", { name: "New layer via copy", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length))
    .toBe(4);
  const copied = await page.evaluate(() => window.musart!.snapshot()),
    copy = copied.project.pages[0]!.layers.find((layer) => layer.id === copied.selection[0])!;
  expect(copy.mask?.layerId).toBeTruthy();
  expect(copy.parentId).toBe(parent.id);
  expect(copied.project.pages[0]!.layers.find((layer) => layer.id === original.id)).toEqual(
    original,
  );
  await page.evaluate(() =>
    window.musart!.execute({ type: "updateLayers", ids: ["original"], patch: { visible: false } }),
  );
  await ready(page);
  const url = await page.evaluate(() => window.musart!.render({ format: "png" }));
  const points = [36, 44, 52].map((x) => transformPoint(matrix, { x: x * 2, y: 64 }));
  const inspector = await context.newPage();
  try {
    const rgba = await inspector.evaluate(
      async ({ url, points }) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        return points.map((point) =>
          Array.from(ctx.getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data),
        );
      },
      { url, points },
    );
    expect(rgba[0]![3]).toBeGreaterThanOrEqual(87);
    expect(rgba[0]![3]).toBeLessThanOrEqual(91);
    expect(rgba[0]![1]).toBeGreaterThan(180);
    expect(rgba[1]![3]).toBe(0);
    expect(rgba[2]![3]).toBe(0);
  } finally {
    await inspector.close();
  }
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
  });
  expect(failures).toEqual([]);
});
test("Ctrl/Cmd+J extracts selected pixels in place, then duplicates whole layers in place with exact undo/redo", async ({
  page,
  context,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64"><path fill="#e03040" d="M0 0h32v64H0z"/><path fill="#30c080" d="M32 0h32v64H32z"/><path fill="#3050e0" d="M64 0h32v64H64z"/></svg>';
  const project = createProject({
    pages: [
      createPage({
        width: 320,
        height: 192,
        background: "#00000000",
        layers: [
          createLayer("image", {
            id: "original",
            assetId: "source",
            x: 32,
            y: 32,
            width: 192,
            height: 128,
          }),
          createLayer("text", { id: "top", text: "Top", x: 260, y: 32, width: 50, height: 50 }),
        ],
      }),
    ],
    assets: {
      source: {
        id: "source",
        name: "Regions",
        mime: "image/svg+xml",
        width: 96,
        height: 64,
        dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
      },
    },
  });
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["original"]);
  }, project);
  await ready(page);
  const before = await page.evaluate(() => window.musart!.snapshot());
  await page.getByRole("button", { name: "Magic wand", exact: true }).click();
  const tolerance = page.getByRole("textbox", { name: "Tolerance", exact: true });
  await tolerance.fill("0");
  await tolerance.press("Enter");
  const board = (await page.getByTestId("artboard").boundingBox())!,
    zoom = Number(await page.getByTestId("artboard").getAttribute("data-zoom"));
  await page.mouse.click(board.x + 128 * zoom, board.y + 96 * zoom);
  const outline = page.getByTestId("pixel-selection-outline");
  await expect(outline).toHaveAttribute("data-selection-pixels", "2048");
  await expect(outline).toHaveAttribute("data-selection-dragging", "false");
  await expect(page.getByRole("button", { name: "New layer via copy", exact: true })).toBeEnabled();
  await page.keyboard.press("Control+j");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().revision))
    .toBe(before.revision + 1);
  await ready(page);
  const copied = await page.evaluate(() => window.musart!.snapshot()),
    copyId = copied.selection[0]!,
    copy = copied.project.pages[0]!.layers[1]!;
  expect(copy.id).toBe(copyId);
  expect(copy).toMatchObject({ kind: "image", x: 96, y: 32, width: 64, height: 128, mask: null });
  expect(copied.project.pages[0]!.layers.map((layer) => layer.id)).toEqual([
    "original",
    copyId,
    "top",
  ]);
  expect(copied.project.pages[0]!.layers[0]).toEqual(before.project.pages[0]!.layers[0]);
  expect(copied.project.assets.source).toEqual(before.project.assets.source);
  const asset = copied.project.assets[copy.assetId!]!;
  expect(asset).toMatchObject({ width: 32, height: 64, mime: "image/png" });
  expect(
    "dataUrl" in asset &&
      typeof asset.dataUrl === "string" &&
      asset.dataUrl.startsWith("data:image/png;base64,"),
  ).toBe(true);
  await expect(outline).not.toBeVisible();
  const inspector = await context.newPage();
  try {
    const decoded = await inspector.evaluate(async (asset) => {
      if (!("dataUrl" in asset) || typeof asset.dataUrl !== "string")
        throw Error("Missing copied image");
      const image = new Image();
      image.src = asset.dataUrl;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      return {
        width: image.width,
        height: image.height,
        first: Array.from(ctx.getImageData(0, 0, 1, 1).data),
        last: Array.from(ctx.getImageData(31, 63, 1, 1).data),
      };
    }, asset);
    expect(decoded).toEqual({
      width: 32,
      height: 64,
      first: [48, 192, 128, 255],
      last: [48, 192, 128, 255],
    });
  } finally {
    await inspector.close();
    await page.bringToFront();
  }
  await page.screenshot({ path: "artifacts/layer-via-copy/copied.png" });
  const tabs = context.pages().length;
  await page.keyboard.press("Meta+j");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().revision))
    .toBe(copied.revision + 1);
  await ready(page);
  const duplicated = await page.evaluate(() => window.musart!.snapshot()),
    secondId = duplicated.selection[0]!,
    second = duplicated.project.pages[0]!.layers.find((layer) => layer.id === secondId)!;
  expect(second).toMatchObject({
    x: copy.x,
    y: copy.y,
    width: copy.width,
    height: copy.height,
    assetId: copy.assetId,
  });
  expect(duplicated.project.pages[0]!.layers.map((layer) => layer.id)).toEqual([
    "original",
    copyId,
    secondId,
    "top",
  ]);
  expect(Object.keys(duplicated.project.assets)).toHaveLength(2);
  expect(context.pages()).toHaveLength(tabs);
  await page.keyboard.press("Control+z");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project))
    .toEqual(copied.project);
  await page.keyboard.press("Control+z");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project))
    .toEqual(before.project);
  expect((await page.evaluate(() => window.musart!.snapshot())).canUndo).toBe(false);
  await page.keyboard.press("Control+Shift+z");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project))
    .toEqual(copied.project);
  await page.keyboard.press("Control+Shift+z");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project))
    .toEqual(duplicated.project);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
  });
  expect(failures).toEqual([]);
});
