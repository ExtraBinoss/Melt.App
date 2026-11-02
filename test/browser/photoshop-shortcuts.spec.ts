import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
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
test.beforeEach(async ({ page }) => {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "en");
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
});
async function pixels(inspector: Page, url: string, points: number[][]) {
  return inspector.evaluate(
    async ({ url, points }) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return points.map(([x, y]) => Array.from(context.getImageData(x!, y!, 1, 1).data));
    },
    { url, points },
  );
}
test("native invert, deselect/reselect and layer via cut retain exact pixels with atomic undo", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64"><path fill="#e03040" d="M0 0h32v64H0z"/><path fill="#30c080" d="M32 0h32v64H32z"/><path fill="#3050e0" d="M64 0h32v64H64z"/></svg>';
  const project = createProject({
    pages: [
      createPage({
        width: 320,
        height: 192,
        background: "transparent",
        layers: [
          createLayer("image", {
            id: "original",
            assetId: "source",
            x: 32,
            y: 32,
            width: 192,
            height: 128,
          }),
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
  await page.keyboard.press("Control+Shift+i");
  await expect(outline).toHaveAttribute("data-selection-pixels", "4096");
  await page.keyboard.press("Control+d");
  await expect(outline).not.toBeVisible();
  await page.keyboard.press("Control+Shift+d");
  await expect(outline).toHaveAttribute("data-selection-pixels", "4096");
  expect((await page.evaluate(() => window.musart!.snapshot())).project).toEqual(before.project);
  await page.keyboard.press("Control+Shift+i");
  await expect(outline).toHaveAttribute("data-selection-pixels", "2048");
  await page.keyboard.press("Control+Shift+j");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().revision))
    .toBe(before.revision + 1);
  await ready(page);
  const cut = await page.evaluate(() => window.musart!.snapshot()),
    copy = cut.project.pages[0]!.layers.find((layer) => layer.id === cut.selection[0])!;
  expect(copy).toMatchObject({ kind: "image", x: 96, y: 32, width: 64, height: 128 });
  expect(cut.project.assets.source).toEqual(before.project.assets.source);
  expect(
    cut.project.pages[0]!.layers.find((layer) => layer.id === "original")!.mask?.inverted,
  ).toBe(true);
  const inspector = await context.newPage();
  try {
    const full = await page.evaluate(() => window.musart!.render({ format: "png" }));
    expect((await pixels(inspector, full, [[128, 96]]))[0]).toEqual([48, 192, 128, 255]);
    await page.evaluate(
      (id) =>
        window.musart!.execute({ type: "updateLayers", ids: [id], patch: { visible: false } }),
      copy.id,
    );
    await ready(page);
    const hole = await page.evaluate(() => window.musart!.render({ format: "png" }));
    const samples = await pixels(inspector, hole, [
      [64, 96],
      [128, 96],
      [192, 96],
    ]);
    expect(samples[0]).toEqual([224, 48, 64, 255]);
    expect(samples[1]![3]).toBe(0);
    expect(samples[2]).toEqual([48, 80, 224, 255]);
    await page.evaluate(() => window.musart!.undo());
    await page.keyboard.press("Control+z");
    await expect
      .poll(() => page.evaluate(() => window.musart!.snapshot().project))
      .toEqual(before.project);
    expect((await page.evaluate(() => window.musart!.snapshot())).canUndo).toBe(false);
    await page.keyboard.press("Control+Shift+z");
    await expect
      .poll(() => page.evaluate(() => window.musart!.snapshot().project))
      .toEqual(cut.project);
  } finally {
    await inspector.close();
  }
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
  });
  expect(errors).toEqual([]);
});
test("native stacking and clipping render a visible base and an independent mask under shared parent opacity", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const group = createLayer("group", {
      id: "group",
      x: 0,
      y: 0,
      width: 160,
      height: 120,
      opacity: 0.5,
    }),
    base = createLayer("rectangle", {
      id: "base",
      parentId: "group",
      x: 20,
      y: 20,
      width: 80,
      height: 80,
      fill: "#ff0000",
    }),
    mask = createLayer("rectangle", {
      id: "mask",
      x: 0,
      y: 0,
      width: 160,
      height: 60,
      fill: "#ffffff",
      maskSource: true,
    }),
    top = createLayer("rectangle", {
      id: "top",
      parentId: "group",
      x: 60,
      y: 0,
      width: 80,
      height: 120,
      fill: "#0000ff",
      mask: { layerId: "mask", enabled: true, inverted: false, mode: "alpha" },
    }),
    project = createProject({
      pages: [
        createPage({
          width: 160,
          height: 120,
          background: "transparent",
          layers: [mask, group, base, top],
        }),
      ],
    });
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["top"]);
  }, project);
  await ready(page);
  await page.keyboard.press("Control+[");
  await expect
    .poll(() =>
      page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.map((l) => l.id)),
    )
    .toEqual(["mask", "group", "top", "base"]);
  await page.keyboard.press("Control+]");
  await expect
    .poll(() =>
      page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.map((l) => l.id)),
    )
    .toEqual(["mask", "group", "base", "top"]);
  await page.keyboard.press("Control+Alt+g");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.musart!.snapshot().project.pages[0]!.layers.find((l) => l.id === "top")!.clipping,
      ),
    )
    .toEqual({ layerId: "base" });
  await ready(page);
  const clipped = await page.evaluate(() => window.musart!.snapshot());
  expect(clipped.project.pages[0]!.layers.find((l) => l.id === "base")).toEqual(base);
  expect(clipped.project.pages[0]!.layers.find((l) => l.id === "top")!.mask).toEqual(top.mask);
  const inspector = await context.newPage();
  try {
    const url = await page.evaluate(() => window.musart!.render({ format: "png" }));
    const sample = await pixels(inspector, url, [
      [40, 40],
      [80, 40],
      [120, 40],
      [80, 80],
    ]);
    expect(sample[0]).toEqual([255, 0, 0, 128]);
    expect(sample[1]).toEqual([0, 0, 255, 128]);
    expect(sample[2]![3]).toBe(0);
    expect(sample[3]).toEqual([255, 0, 0, 128]);
    const fallback = await page.evaluate(() =>
      window.musart!.render({ format: "png", forceWebGL: true }),
    );
    expect(
      await pixels(inspector, fallback, [
        [40, 40],
        [80, 40],
        [120, 40],
        [80, 80],
      ]),
    ).toEqual(sample);
    await page.evaluate(() =>
      window.musart!.execute({ type: "updateLayers", ids: ["base"], patch: { x: 40 } }),
    );
    await ready(page);
    const moved = await pixels(
      inspector,
      await page.evaluate(() => window.musart!.render({ format: "png" })),
      [[110, 40]],
    );
    expect(moved[0]).toEqual([0, 0, 255, 128]);
    await page.keyboard.press("Control+Alt+g");
    await ready(page);
    expect(
      (
        await pixels(
          inspector,
          await page.evaluate(() => window.musart!.render({ format: "png" })),
          [[130, 40]],
        )
      )[0],
    ).toEqual([0, 0, 255, 128]);
    await page.keyboard.press("Control+z");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.musart!.snapshot().project.pages[0]!.layers.find((l) => l.id === "top")!
              .clipping,
        ),
      )
      .toEqual({ layerId: "base" });
  } finally {
    await inspector.close();
  }
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
  });
  expect(errors).toEqual([]);
});
test("palette and shortcut settings search translated descriptions and chords with explicit key separators", async ({
  page,
}) => {
  await ready(page);
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Search Melt", exact: true }),
    input = palette.getByRole("combobox");
  for (const query of ["ctrl j", "ctrl+j", "Command + J"]) {
    await input.fill(query);
    const option = palette.getByRole("option").first();
    await expect(option).toContainText("New layer via copy");
    await expect(option.locator('[data-slot="kbd-separator"]')).toHaveText(["+"]);
  }
  await input.fill("Soften image details");
  await expect(palette.getByRole("option").first()).toContainText("Blur");
  await input.fill("gauss");
  await expect(palette.getByRole("option").filter({ hasText: "Blur" }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("?");
  const settings = page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true }),
    search = settings.getByRole("searchbox");
  await search.fill("ctrl+shift+j");
  await expect(settings.locator('[data-binding-command="action:layerViaCut"]')).toBeVisible();
  await expect(settings.locator('[data-binding-command="action:layerViaCopy"]')).toHaveCount(0);
  await search.fill("remove that area");
  await expect(settings.locator('[data-binding-command="action:layerViaCut"]')).toBeVisible();
  await search.fill("ctrl j");
  await settings
    .locator('[data-binding-command="action:layerViaCopy"]')
    .getByRole("button", { name: "Change shortcut for New layer via copy", exact: true })
    .click();
  await page.keyboard.press("Control+Alt+q");
  await settings.getByRole("button", { name: "Close", exact: true }).click();
  await page.keyboard.press("Control+k");
  await input.fill("ctrl alt q");
  await expect(palette.getByRole("option").first()).toContainText("New layer via copy");
  await input.fill("ctrl j");
  await expect(palette.getByRole("option").filter({ hasText: "New layer via copy" })).toHaveCount(
    0,
  );
  await input.fill("Passer en français");
  await palette.getByRole("option").first().click();
  await expect(palette).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Rechercher dans Melt", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  const french = page.getByRole("dialog", { name: "Rechercher dans Melt", exact: true });
  for (const query of ["Adoucir les détails", "Soften image details"]) {
    await french.getByRole("combobox").fill(query);
    await expect(french.getByRole("option").first()).toContainText("Flou");
  }
  await page.screenshot({ path: "artifacts/photoshop-shortcuts/shortcut-settings.png" });
});
