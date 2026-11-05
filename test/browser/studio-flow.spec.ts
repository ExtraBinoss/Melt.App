import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { Project } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

async function ready(page: Page) {
  await page.waitForFunction(
    () => {
      const c = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
      return (
        c?.dataset.presentationReady === "true" &&
        c.dataset.rendererReady === "true" &&
        c.dataset.sceneRevision === c.dataset.renderedRevision
      );
    },
    undefined,
    { timeout: 45000 },
  );
}
async function observe(page: Page) {
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")!;
    const data = {
      held: false,
      moves: 0,
      inputs: 0,
      start: 0,
      frames: [] as { held: boolean; moves: number; inputs: number; ms: number }[],
    };
    const down = () => {
      data.held = true;
      data.start = performance.now();
      data.moves = 0;
    };
    const move = () => {
      if (data.held) data.moves++;
    };
    const up = () => {
      data.held = false;
    };
    const input = () => {
      if (!data.inputs) data.start = performance.now();
      data.inputs++;
    };
    const observer = new MutationObserver(() => {
      if (canvas.dataset.presentationReady === "true")
        data.frames.push({
          held: data.held,
          moves: data.moves,
          inputs: data.inputs,
          ms: performance.now() - data.start,
        });
    });
    observer.observe(canvas, { attributes: true, attributeFilter: ["data-rendered-revision"] });
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("input", input, true);
    Object.assign(window, {
      __flow: data,
      __stopFlow: () => {
        observer.disconnect();
        document.removeEventListener("pointerdown", down, true);
        document.removeEventListener("pointermove", move, true);
        document.removeEventListener("pointerup", up, true);
        document.removeEventListener("input", input, true);
      },
    });
  });
}
const evidence = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __flow: { frames: { held: boolean; moves: number; inputs: number; ms: number }[] };
        }
      ).__flow,
  );
const stop = (page: Page) =>
  page.evaluate(() => (window as unknown as { __stopFlow: () => void }).__stopFlow());
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");

test("Studio 1080p keeps the word framed, exposes basics and presents text and geometry during continuous input", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  await mkdir("artifacts/studio", { recursive: true });
  await installReadbackProbe(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  await page.goto("/editor?automation=1&workspace=studio&profile3d=1");
  await page.waitForFunction(() => !!window.musart, undefined, { timeout: 60000 });
  const { project } = JSON.parse(
    await readFile("apps/web/public/templates/designed/studio-starter/studio-starter.json", "utf8"),
  ) as { project: Project };
  await page.evaluate((p) => {
    window.musart!.load(p);
    window.musart!.select([]);
  }, project);
  const canvas = page.locator(".editor-gpu-scene canvas");
  await expect(canvas).toHaveAttribute("data-page-id", "studio-starter-composition");
  await ready(page);
  const frame = (await canvas.boundingBox())!;
  const gate = (await page.getByTestId("artboard").boundingBox())!;
  expect(gate.width / gate.height).toBeCloseTo(16 / 9, 2);
  expect(frame).toEqual((await page.getByTestId("editor-canvas").boundingBox())!);
  const density = await canvas.evaluate((node) => ({
    renderWidth: Number((node as HTMLCanvasElement).dataset.renderWidth),
    width: node.getBoundingClientRect().width,
    dpr: devicePixelRatio,
  }));
  expect(density.renderWidth).toBeGreaterThanOrEqual(density.width * density.dpr * 0.95);
  const encoded = await page.evaluate(() => window.musart!.render({ scale: 0.5, format: "webp" }));
  await writeFile(
    "artifacts/studio/studio-starter-flow.webp",
    Buffer.from(encoded.split(",")[1]!, "base64"),
  );
  const inspection = await context.newPage();
  const ink = await inspection.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const c = document.createElement("canvas");
    c.width = image.width;
    c.height = image.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
    let left = c.width,
      right = 0,
      top = c.height,
      bottom = 0,
      click = -1;
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (
          Math.abs(pixels[i]! - 245) +
            Math.abs(pixels[i + 1]! - 241) +
            Math.abs(pixels[i + 2]! - 234) <
          55
        )
          continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        if (y === Math.floor(c.height / 2) && click < 0) click = x;
      }
    return { left, right, top, bottom, click, width: c.width, height: c.height };
  }, encoded);
  await inspection.close();
  expect(ink.left).toBeGreaterThan(ink.width * 0.15);
  expect(ink.right).toBeLessThan(ink.width * 0.85);
  expect(ink.top).toBeGreaterThan(ink.height * 0.2);
  expect(ink.bottom).toBeLessThan(ink.height * 0.8);
  expect(ink.click).toBeGreaterThan(0);
  await page.mouse.click(
    gate.x + ((ink.click + 3) / ink.width) * gate.width,
    gate.y + gate.height / 2,
  );
  await expect
    .poll(() => page.evaluate(() => window.musart!.session().selection))
    .toEqual(["studio-title"]);
  const bar = page.locator(".studio-object-bar");
  await expect(bar.getByRole("textbox", { name: "Text content", exact: true })).toBeVisible();
  await expect(bar.getByRole("slider", { name: "Depth", exact: true })).toBeVisible();
  await expect(bar.getByRole("slider", { name: "Bevel", exact: true })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Properties", exact: true })).toHaveCount(0);
  await expect.poll(() => canvas.getAttribute("data-spatial-center")).toBeTruthy();
  const pivot = JSON.parse((await canvas.getAttribute("data-spatial-center"))!) as {
    x: number;
    y: number;
  };
  expect(Math.abs(pivot.x - (ink.left + ink.right) / 2 / ink.width)).toBeLessThan(0.04);
  expect(Math.abs(pivot.y - (ink.top + ink.bottom) / 2 / ink.height)).toBeLessThan(0.04);
  await ready(page);
  await page.screenshot({ path: "artifacts/studio/studio-direct-controls.png" });
  const before = await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project));
  const revision = await page.evaluate(() => window.musart!.session().revision);
  const baseline = await canvas.screenshot();
  const counters = () =>
    page
      .locator(".musart-app,.canvas-area,.editor-canvas,.editor-gpu-scene")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-react-renders")));
  const beforeCounters = await counters();
  await observe(page);
  const track = bar.locator('.studio-slider:has([aria-label="Depth"]) [data-slot="slider-track"]');
  const box = (await track.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.04, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.16, box.y + box.height / 2, { steps: 90 });
  await expect
    .poll(
      async () =>
        (await evidence(page)).frames.filter((f) => f.held && f.moves > 0 && f.moves < 90).length,
    )
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(before);
  expect(hash(await canvas.screenshot())).not.toBe(hash(baseline));
  expect(await counters()).toEqual(beforeCounters);
  const geometryFrames = await evidence(page);
  await page.mouse.up();
  await stop(page);
  await ready(page);
  expect(await page.evaluate(() => window.musart!.session().revision)).toBe(revision + 1);
  await page.evaluate(() => window.musart!.undo());
  await ready(page);
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(before);
  const field = bar.getByRole("textbox", { name: "Text content", exact: true });
  const textCounters = await counters();
  await observe(page);
  await field.focus();
  await field.press("Control+a");
  await page.keyboard.type("MOLT", { delay: 90 });
  await expect
    .poll(
      async () => (await evidence(page)).frames.filter((f) => f.inputs > 0 && f.inputs < 4).length,
    )
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.text),
  ).toBe("MELT");
  expect(await counters()).toEqual(textCounters);
  const textFrames = await evidence(page);
  await stop(page);
  await field.press("Escape");
  await ready(page);
  await field.fill("");
  await ready(page);
  await expect(canvas).not.toHaveAttribute("data-render-error", /.+/);
  await field.fill("MELT");
  await ready(page);
  await field.press("Escape");
  await ready(page);
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(before);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeLessThanOrEqual(391);
  const portraitBox = (await canvas.boundingBox())!;
  expect(portraitBox.width / portraitBox.height).toBeCloseTo(390 / 844, 2);
  const portraitGate = (await page.getByTestId("artboard").boundingBox())!;
  expect(portraitGate.width / portraitGate.height).toBeCloseTo(16 / 9, 2);
  await ready(page);
  await expect(bar.getByRole("textbox", { name: "Text content", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/studio/studio-direct-controls-mobile.png" });
  const reads = await page.evaluate(() => window.__musartVideoReadbacks);
  expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  await writeFile(
    "artifacts/studio/flow-live-evidence.json",
    JSON.stringify({ geometryFrames, textFrames, density, pivot, ink, reads, errors }, null, 2),
  );
  expect(errors).toEqual([]);
});
