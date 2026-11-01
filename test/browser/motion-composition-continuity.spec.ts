import { expect, test, type Page } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import type { Project } from "@musart/core";
import { startEditorTrace } from "./support/editor-action-probe";
import { installReadbackProbe } from "./support/readback-probe";
interface FrameSample {
  time: number;
  observed: number;
  pageId: string | undefined;
  layerY: number;
  canvasH: number;
  rootY: number;
  bodyY: number;
  ready: string | undefined;
}
const project = JSON.parse(
  readFileSync("apps/web/public/templates/motion/morphing-type/morphing-type.json", "utf8"),
).project as Project;
const moving = project.pages[0]!;
const still = { ...moving, id: "still-real", name: "Static board", layers: [] };
delete still.motion;
project.id = "motion-melt-continuity";
project.pages = [still, moving];
async function ready(page: Page) {
  await page.waitForFunction(() => {
    const c = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
    return (
      c?.dataset.rendererReady === "true" && c.dataset.sceneRevision === c.dataset.renderedRevision
    );
  });
}
async function capture(page: Page, id: string, route: "canvas" | "layers" = "canvas") {
  await page.evaluate(() => {
    const data = {
      input: 0,
      dispatch: 0,
      frames: [] as FrameSample[],
    };
    (window as Window & { __motionContinuity?: typeof data }).__motionContinuity = data;
    window.addEventListener(
      "pointerdown",
      (e) => {
        data.input = e.timeStamp;
        data.dispatch = performance.now();
      },
      { once: true, capture: true },
    );
    const start = performance.now();
    let entered = 0;
    function frame(time: number) {
      const root = document.querySelector<HTMLElement>(".motion-timeline-dock");
      const body = document.querySelector<HTMLElement>(".motion-timeline-surface");
      data.frames.push({
        time,
        observed: performance.now(),
        pageId: document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset
          .pageId,
        layerY: document.querySelector(".layers-panel")!.getBoundingClientRect().y,
        canvasH: document.querySelector(".editor-canvas")!.clientHeight,
        rootY: root ? new DOMMatrix(getComputedStyle(root).transform).m42 : 0,
        bodyY: body ? new DOMMatrix(getComputedStyle(body).transform).m42 : 0,
        ready: document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset
          .rendererReady,
      });
      if (data.input && !entered) entered = performance.now();
      if ((!entered || performance.now() - entered < 800) && performance.now() - start < 10000)
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  if (route === "layers")
    await page.locator(`.layer-tree [data-layer-tree-key="artboard:${id}"]`).click();
  else {
    const board = await page
      .locator(`.canvas-artboard-backdrop[data-artboard-id="${id}"]`)
      .boundingBox();
    if (!board) throw new Error("Artboard surface is unavailable");
    // Blank paper, through EditorCanvas's native picking path rather than a heading button.
    await page.mouse.click(board.x + 12, board.y + 12);
  }
  await ready(page);
  await page.waitForTimeout(850);
  return page.evaluate(
    () =>
      (
        window as Window & {
          __motionContinuity?: {
            input: number;
            dispatch: number;
            frames: FrameSample[];
          };
        }
      ).__motionContinuity!,
  );
}
test("real Melt navigation retains GPU work, leaves peek layout unchanged and visibly animates pinned panels", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((value) => window.musart!.load(value), project);
  await ready(page);
  const cold = await capture(page, moving.id);
  expect(new Set(cold.frames.map((frame) => frame.layerY)).size).toBe(1);
  expect(new Set(cold.frames.map((frame) => frame.canvasH)).size).toBe(1);
  await capture(page, still.id);
  const before = await page.locator(".editor-gpu-scene canvas").getAttribute("data-gpu-stats");
  const stopTrace = await startEditorTrace(page, "artifacts/motion-melt-continuity/warm-switch");
  let warm: Awaited<ReturnType<typeof capture>>;
  try {
    warm = await capture(page, moving.id);
  } finally {
    await stopTrace();
  }
  const after = JSON.parse(
    (await page.locator(".editor-gpu-scene canvas").getAttribute("data-gpu-stats"))!,
  );
  expect(after.passes).toBe(JSON.parse(before!).passes);
  expect(after.uploads).toBe(JSON.parse(before!).uploads);
  expect(after.cacheHits).toBeGreaterThan(JSON.parse(before!).cacheHits);
  await capture(page, still.id, "layers");
  const stopLayerTrace = await startEditorTrace(
    page,
    "artifacts/motion-melt-continuity/warm-layer-switch",
  );
  let layerSwitch: Awaited<ReturnType<typeof capture>>;
  try {
    layerSwitch = await capture(page, moving.id, "layers");
  } finally {
    await stopLayerTrace();
  }
  expect(new Set(layerSwitch.frames.map((frame) => frame.layerY)).size).toBe(1);

  await page.getByRole("button", { name: "Pin timeline", exact: true }).click();
  await expect(page.locator(".motion-timeline-dock")).not.toHaveAttribute("data-motion-animating");
  const pinned = await capture(page, still.id);
  expect(new Set(pinned.frames.map((frame) => Math.round(frame.layerY))).size).toBeGreaterThan(3);
  const restored = await capture(page, moving.id);
  expect(new Set(restored.frames.map((frame) => Math.round(frame.layerY))).size).toBeGreaterThan(3);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  mkdirSync("artifacts/motion-melt-continuity", { recursive: true });
  writeFileSync(
    "artifacts/motion-melt-continuity/frames.json",
    JSON.stringify({ cold, warm, layerSwitch, pinned, restored, gpu: after }, null, 2),
  );
  const environment = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    return {
      userAgent: navigator.userAgent,
      dpr: devicePixelRatio,
      backend: document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset
        .backend,
      adapter: adapter
        ? {
            vendor: adapter.info.vendor,
            architecture: adapter.info.architecture,
            device: adapter.info.device,
            description: adapter.info.description,
          }
        : null,
    };
  });
  writeFileSync(
    "artifacts/motion-melt-continuity/environment.json",
    JSON.stringify(environment, null, 2),
  );
  await page.screenshot({ path: "artifacts/motion-melt-continuity/final.png" });
  expect(new Set(cold.frames.map((frame) => Math.round(frame.rootY * 100))).size).toBeGreaterThan(
    3,
  );
});
