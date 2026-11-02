import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { zoomViewport } from "./support/viewport";

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket("**", () => {});
});

test("double-click edits GPU text live, commits once, and cancels the next draft", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "en");
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      id: "inline-text-native",
      pages: [
        createPage({
          id: "text-page",
          width: 400,
          height: 260,
          layers: [
            createLayer("text", {
              id: "editable-text",
              text: "Original",
              x: 30,
              y: 40,
              width: 300,
              height: 150,
              fontSize: 44,
              fill: "#202024",
            }),
          ],
        }),
      ],
    }),
  );
  const canvas = page.locator('[data-testid="artboard"] canvas');
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas');
    return (
      canvas?.dataset.projectId === "inline-text-native" &&
      canvas.dataset.rendererReady === "true" &&
      canvas.dataset.renderedRevision === canvas.dataset.sceneRevision
    );
  });
  const board = await page.getByTestId("artboard").boundingBox();
  const zoom = Number(await page.getByTestId("artboard").getAttribute("data-zoom"));
  const point = { x: board!.x + 70 * zoom, y: board!.y + 70 * zoom };
  const before = await page.evaluate(() => window.musart!.snapshot().revision);
  await page.mouse.dblclick(point.x, point.y);
  const editor = page.getByTestId("canvas-text-editor");
  await expect(editor).toBeFocused();
  await editor.evaluate((element) => {
    element.style.opacity = "0";
  });
  const imageBefore = await canvas.screenshot();
  await editor.evaluate((element) => {
    element.style.opacity = "1";
  });
  const renders = Number(await canvas.getAttribute("data-render-count"));
  const commits = await page.evaluate(() =>
    [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
      (selector) => document.querySelector<HTMLElement>(selector)?.dataset.reactRenders,
    ),
  );
  await editor.fill("Live\nmultiline");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-render-count")))
    .toBeGreaterThan(renders);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(before);
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.text),
  ).toBe("Original");
  expect(
    await page.evaluate(() =>
      [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
        (selector) => document.querySelector<HTMLElement>(selector)?.dataset.reactRenders,
      ),
    ),
  ).toEqual(commits);
  // Hide only the native caret/selection overlay: the screenshot witnesses actual GPU output.
  await editor.evaluate((element) => {
    element.style.opacity = "0";
  });
  expect((await canvas.screenshot()).equals(imageBefore)).toBe(false);
  await editor.evaluate((element) => {
    element.style.opacity = "1";
  });
  const inspector = page.locator('.inspector textarea[aria-label="Text content"]');
  await inspector.click();
  await expect(editor).toHaveCount(0);
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.text),
  ).toBe("Live\nmultiline");
  await page.evaluate(() => window.musart!.undo());
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.text),
  ).toBe("Original");
  await page.evaluate(() => window.musart!.redo());
  await inspector.click();
  const inspectorRevision = await page.evaluate(() => window.musart!.snapshot().revision);
  const inspectorRenders = Number(await canvas.getAttribute("data-render-count"));
  await inspector.fill("Inspector live");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-render-count")))
    .toBeGreaterThan(inspectorRenders);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(inspectorRevision);
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.text),
  ).toBe("Live\nmultiline");
  await inspector.press("Escape");
  await expect(inspector).toHaveValue("Live\nmultiline");
  await page.mouse.dblclick(point.x, point.y);
  await expect(editor).toBeFocused();
  await editor.fill("Discard");
  await editor.press("Escape");
  await expect(editor).toHaveCount(0);
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.text),
  ).toBe("Live\nmultiline");
  // A Layers-selected text keeps its edit target even beneath translucent artwork.
  await page.evaluate(
    (cover) => window.musart!.execute({ type: "addLayers", layers: [cover] }),
    createLayer("rectangle", {
      id: "text-cover",
      x: 30,
      y: 40,
      width: 300,
      height: 150,
      fill: "#ff000030",
    }),
  );
  const row = page.locator('.layer-row[data-layer-id="editable-text"]');
  await row.click();
  await expect(row).toHaveAttribute("aria-selected", "true");
  await page.mouse.dblclick(point.x, point.y);
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue("Live\nmultiline");
  await editor.fill("Selected in Layers");
  await editor.press("Control+Enter");
  await expect(editor).toHaveCount(0);
  // The portal-mounted top resize edge also accepts double-click entry on existing selection.
  await page.mouse.dblclick(board!.x + 100 * zoom, board!.y + 41 * zoom);
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue("Selected in Layers");
  await editor.fill("Repeated edit");
  await inspector.click();
  await expect(editor).toHaveCount(0);
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.text),
  ).toBe("Repeated edit");
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["outline-text"]);
    },
    createProject({
      id: "colored-text-outline",
      pages: [
        createPage({
          width: 320,
          height: 180,
          layers: [
            createLayer("text", {
              id: "outline-text",
              text: "M",
              x: 25,
              y: 20,
              width: 260,
              height: 140,
              fontSize: 110,
              fill: "#0000ff",
              stroke: "#ff0000",
              strokeWidth: 0,
            }),
          ],
        }),
      ],
    }),
  );
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas');
    return (
      canvas?.dataset.projectId === "colored-text-outline" &&
      canvas.dataset.sceneRevision === canvas.dataset.renderedRevision
    );
  });
  const outlineWidth = page.getByLabel("Outline width", { exact: true });
  const outlineBefore = await canvas.screenshot(),
    outlineRender = Number(await canvas.getAttribute("data-render-count"));
  const outlineRevision = await page.evaluate(() => window.musart!.snapshot().revision);
  await outlineWidth.fill("6");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-render-count")))
    .toBeGreaterThan(outlineRender);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(outlineRevision);
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.strokeWidth),
  ).toBe(0);
  expect((await canvas.screenshot()).equals(outlineBefore)).toBe(false);
  await outlineWidth.press("Escape");
  await expect(outlineWidth).toHaveValue("0");
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(outlineRevision);
  await outlineWidth.fill("6");
  await outlineWidth.press("Tab");
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.strokeWidth),
  ).toBe(6);
  await page.evaluate(() => window.musart!.undo());
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.strokeWidth),
  ).toBe(0);
  await page.evaluate(() => window.musart!.redo());
  const exported = await page.evaluate(() => window.musart!.render({ scale: 1 }));
  const decoder = await page.context().newPage();
  try {
    const colors = await decoder.evaluate(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const output = document.createElement("canvas");
      output.width = image.width;
      output.height = image.height;
      const context = output.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, output.width, output.height).data;
      let red = 0,
        blue = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index]! > 180 && pixels[index + 1]! < 70 && pixels[index + 2]! < 70) red++;
        if (pixels[index + 2]! > 180 && pixels[index]! < 70 && pixels[index + 1]! < 70) blue++;
      }
      return { red, blue };
    }, exported);
    expect(colors.red).toBeGreaterThan(30);
    expect(colors.blue).toBeGreaterThan(30);
  } finally {
    await decoder.close();
  }
});

test("an initially outlined GPU text resets to identical fill pixels without rebuilding its resource", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "en");
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      id: "outlined-zero-native",
      pages: [
        createPage({
          id: "zero-board",
          width: 600,
          height: 180,
          layers: [0, 1].map((i) =>
            createLayer("text", {
              id: `zero-${i}`,
              text: "M",
              x: i * 300,
              y: 20,
              width: 260,
              height: 140,
              fontSize: 110,
              fill: "#0000ff",
              stroke: "#ff0000",
              strokeWidth: i ? 0 : 6,
            }),
          ),
        }),
      ],
    }),
  );
  const ready = () =>
    page.waitForFunction(() => {
      const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
      return (
        data?.projectId === "outlined-zero-native" &&
        data.rendererReady === "true" &&
        Number(data.canonicalRevision) === window.musart!.session().revision
      );
    });
  await ready();
  const box = (await page.getByTestId("artboard").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await zoomViewport(page, 1);
  await ready();
  const inventory = () =>
    page.evaluate(() => {
      const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")!.dataset;
      return (JSON.parse(data.gpuStats!) as { text: { rebuilds: number; compilations: number } })
        .text;
    });
  const before = await inventory();
  await page.evaluate(() =>
    window.musart!.execute({ type: "updateLayers", ids: ["zero-0"], patch: { strokeWidth: 0 } }),
  );
  await ready();
  const after = await inventory();
  expect(after.rebuilds).toBe(before.rebuilds);
  expect(after.compilations).toBe(before.compilations);
  await page.mouse.move(100, 100);
  const rendered = (await page.locator(".editor-gpu-scene canvas").boundingBox())!;
  expect(rendered.width).toBeCloseTo(600, 0);
  // Locator screenshots round both fractional CSS edges outwards (600 -> 601).
  // Compare a pixel-aligned interior so the two authored 300px halves stay aligned.
  const png = await page.screenshot({
    clip: { x: Math.ceil(rendered.x), y: Math.ceil(rendered.y), width: 600, height: 178 },
  });
  const decoder = await page.context().newPage();
  try {
    const pixels = await decoder.evaluate(
      async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const output = document.createElement("canvas");
        output.width = image.width;
        output.height = image.height;
        const context = output.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const bytes = context.getImageData(0, 0, image.width, image.height).data;
        let difference = 0,
          blue = 0;
        for (let y = 0; y < image.height; y++)
          for (let x = 0; x < image.width / 2; x++) {
            const a = (y * image.width + x) * 4,
              b = a + image.width * 2;
            for (let c = 0; c < 4; c++)
              difference = Math.max(difference, Math.abs(bytes[a + c]! - bytes[b + c]!));
            if (bytes[a + 2]! > 180 && bytes[a]! < 70 && bytes[a + 1]! < 70) blue++;
          }
        return { width: image.width, difference, blue };
      },
      `data:image/png;base64,${png.toString("base64")}`,
    );
    expect(pixels.width).toBe(600);
    expect(pixels.blue).toBeGreaterThan(100);
    expect(pixels.difference).toBeLessThanOrEqual(1);
  } finally {
    await decoder.close();
  }
});
