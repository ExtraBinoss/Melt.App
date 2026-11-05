import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  type Project,
} from "../../packages/core/src/index";
import { installReadbackProbe } from "./support/readback-probe";

test("Studio native recipe previews restore, commit once and export real GPU crops and composition effects", async ({
  page,
  context,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  await page.goto("/editor?automation=1&workspace=studio");
  await page.waitForFunction(() => !!window.musart, undefined, { timeout: 60000 });
  const { project } = JSON.parse(
    await readFile("apps/web/public/templates/designed/studio-starter/studio-starter.json", "utf8"),
  ) as { project: Project };
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["studio-title"]);
  }, project);
  const canvas = page.locator(".editor-gpu-scene canvas");
  await expect(canvas).toHaveAttribute("data-presentation-ready", "true", { timeout: 60000 });
  await expect(page.locator(".studio-dock-content")).toHaveCount(0);
  await expect(page.locator(".studio-agent-anchor")).toHaveCount(0);
  const bounds = await page.locator(".editor-canvas").boundingBox();
  const artboard = await page
    .locator('.canvas-artboard-editor[data-artboard-id="studio-starter-composition"]')
    .boundingBox();
  if (bounds && artboard) {
    expect(artboard.width).toBeLessThanOrEqual(bounds.width + 1);
    expect(artboard.height).toBeLessThanOrEqual(bounds.height + 1);
    expect(artboard.width / artboard.height).toBeCloseTo(1920 / 1080, 2);
  }
  const before = await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project));
  const selection = await page.evaluate(() => window.musart!.session().selection);
  await page.getByRole("button", { name: "Background", exact: true }).click();
  await page.locator(".studio-background-popover").getByRole("button", { name: "Advanced", exact: true }).click();
  await page.locator(".studio-background-advanced").getByRole("button", { name: "Presets", exact: true }).click();
  const preset = page.locator('[data-background-preset="atmosphere-aurora-mist"]');
  await preset.scrollIntoViewIfNeeded();
  const old = await canvas.getAttribute("data-rendered-revision");
  await preset.hover();
  await expect.poll(() => canvas.getAttribute("data-rendered-revision")).not.toBe(old);
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(before);
  await page.screenshot({ path: "artifacts/studio/studio-gradients.png" });
  await page.mouse.move(500, 100);
  await expect(canvas).toHaveAttribute("data-presentation-ready", "true");
  await preset.click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.musart!.snapshot().project.pages[0]!.layers[0]!.effects.map((e) => e.type),
      ),
    )
    .toEqual(["grain", "feather"]);
  expect(await page.evaluate(() => window.musart!.session().selection)).toEqual(selection);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.musart!.undo());
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(before);
  await page.getByRole("button", { name: "Capture guides", exact: true }).click();
  await page.locator('.studio-capture-popover [data-preset-id="custom"]').click();
  await page
    .locator(".studio-capture-popover")
    .getByRole("textbox", { name: "Width", exact: true })
    .fill("320");
  await page
    .locator(".studio-capture-popover")
    .getByRole("textbox", { name: "Width", exact: true })
    .press("Enter");
  await page
    .locator(".studio-capture-popover")
    .getByRole("textbox", { name: "Height", exact: true })
    .fill("480");
  await page
    .locator(".studio-capture-popover")
    .getByRole("textbox", { name: "Height", exact: true })
    .press("Enter");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-studio-capture]")).toBeVisible();
  const capture = (await page.locator("[data-studio-capture]").boundingBox())!;
  expect(capture.width / capture.height).toBeCloseTo(2 / 3, 2);
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(before);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.locator(".export-dialog")).toBeVisible();
  await expect(
    page.locator(".export-dialog").getByRole("textbox", { name: "Width", exact: true }),
  ).toHaveValue("320");
  await expect(
    page.locator(".export-dialog").getByRole("textbox", { name: "Height", exact: true }),
  ).toHaveValue("480");
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "artifacts/studio/studio-immersive.png" });
  const fixture = createProject({
    pages: [
      createPage({
        id: "crop",
        width: 120,
        height: 120,
        background: "transparent",
        layers: [
          createLayer("rectangle", {
            id: "red",
            x: 0,
            y: 0,
            width: 120,
            height: 60,
            fill: "#FF0000",
          }),
          createLayer("rectangle", {
            id: "blue",
            x: 0,
            y: 60,
            width: 120,
            height: 60,
            fill: "#0000FF",
          }),
        ],
        effects: [createEffect("invert", { id: "invert", amount: 1 })],
      }),
    ],
  });
  const encoded = await page.evaluate(async (fixture) => {
    window.musart!.load(fixture);
    return window.musart!.render({
      framing: { width: 40, height: 20, region: { x: 10, y: 5, width: 80, height: 40 } },
    });
  }, fixture);
  await writeFile(
    "artifacts/studio/native-framed.png",
    Buffer.from(encoded.split(",")[1]!, "base64"),
  );
  const reads = await page.evaluate(() => window.__musartVideoReadbacks);
  expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  const inspection = await context.newPage();
  const decoded = await inspection.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const surface = document.createElement("canvas");
    surface.width = image.width;
    surface.height = image.height;
    const ctx = surface.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    return {
      width: image.width,
      height: image.height,
      pixel: [...ctx.getImageData(20, 10, 1, 1).data],
    };
  }, encoded);
  expect(decoded).toMatchObject({ width: 40, height: 20 });
  expect(decoded.pixel[0]).toBeLessThan(5);
  expect(decoded.pixel[1]).toBeGreaterThan(250);
  expect(decoded.pixel[2]).toBeGreaterThan(250);
  expect(decoded.pixel[3]).toBe(255);
  const feathered = await page.evaluate(
    async (project) => {
      window.musart!.load(project);
      window.musart!.execute({ type: "applyBackgroundPreset", presetId: "atmosphere-aurora-mist" });
      return window.musart!.render();
    },
    createProject({
      pages: [createPage({ width: 120, height: 120, background: "transparent", layers: [] })],
    }),
  );
  const alpha = await inspection.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const surface = document.createElement("canvas");
    surface.width = image.width;
    surface.height = image.height;
    const ctx = surface.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    return {
      corner: [...ctx.getImageData(0, 0, 1, 1).data],
      center: [...ctx.getImageData(60, 60, 1, 1).data],
      near: [...ctx.getImageData(30, 24, 1, 1).data],
      far: [...ctx.getImageData(119, 119, 1, 1).data],
    };
  }, feathered);
  expect(alpha.center[3]).toBe(255);
  expect(
    alpha.near
      .slice(0, 3)
      .reduce((sum, value, index) => sum + Math.abs(value - alpha.far[index]!), 0),
  ).toBeGreaterThan(150);
  expect(alpha.corner[3]).toBeLessThan(240);
  expect(alpha.corner[3]).toBeGreaterThan(0);
  expect(alpha.center.slice(0, 3).reduce((a, b) => a + b, 0)).toBeGreaterThan(50);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
  });
  await inspection.close();
  expect(errors).toEqual([]);
});
