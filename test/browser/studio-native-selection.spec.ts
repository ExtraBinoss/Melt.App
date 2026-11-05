import { expect, test, type Page } from "@playwright/test";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
} from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

async function ready(page: Page) {
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
      return (
        canvas?.dataset.presentationReady === "true" && canvas.dataset.rendererReady === "true"
      );
    },
    undefined,
    { timeout: 45000 },
  );
}

test("Studio uses native contours and geometry, and a single camera orbits with no selection", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  const scene = createSpatialScene();
  scene.camera.yaw = 0;
  scene.camera.pitch = 0;
  const project = createProject({
    pages: [
      createPage({
        id: "studio-native-picking",
        width: 900,
        height: 600,
        spatial: scene,
        layers: [
          createLayer("rectangle", {
            id: "background",
            x: 0,
            y: 0,
            width: 900,
            height: 600,
            radius: 0,
            fill: "#555555",
          }),
          createLayer("rectangle", {
            id: "sphere",
            x: 250,
            y: 100,
            width: 400,
            height: 400,
            spatial: createSpatialLayer("sphere"),
            fill: "#8757ff",
          }),
        ],
      }),
    ],
  });
  await page.goto("/editor?automation=1&workspace=studio&profile3d=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((value) => {
    window.musart!.load(value);
    window.musart!.select([]);
  }, project);
  const canvas = page.locator(".editor-gpu-scene canvas");
  await expect(canvas).toHaveAttribute("data-page-id", "studio-native-picking");
  await ready(page);
  const box = (await canvas.boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.waitForTimeout(1600);
  await expect(page.locator(".canvas-timeline-hover[data-layer-id=sphere]")).toBeHidden();
  await canvas.screenshot({ path: "artifacts/studio/native-sphere-contour.png" });
  await page.mouse.click(center.x, center.y);
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().selection))
    .toEqual(["sphere"]);
  await expect(page.locator('.canvas-selection[data-layer-id="sphere"]')).toHaveCount(0);
  // Outside the actual sphere, ordinary background paint cannot take selection.
  await page.mouse.click(box.x + box.width * 0.08, box.y + box.height * 0.08);
  await expect.poll(() => page.evaluate(() => window.musart!.snapshot().selection)).toEqual([]);
  const before = await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project));
  const revision = await page.evaluate(() => window.musart!.session().revision);
  const viewport = (await page.getByTestId("editor-canvas").boundingBox())!;
  await page.mouse.move(viewport.x + viewport.width * 0.08, viewport.y + 8);
  await page.mouse.down();
  await page.mouse.move(viewport.x + viewport.width * 0.2, viewport.y + 25, { steps: 12 });
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(before);
  await page.mouse.up();
  await ready(page);
  await expect.poll(() => page.evaluate(() => window.musart!.session().revision)).toBe(revision + 1);
  await page.evaluate(() => window.musart!.undo());
  await ready(page);
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(before);
  await page.mouse.move(viewport.x + viewport.width * 0.08, viewport.y + 8);
  await page.mouse.down();
  await page.mouse.move(viewport.x + viewport.width * 0.16, viewport.y + 25, { steps: 8 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await ready(page);
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(before);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(1700);
  const frames = await canvas.getAttribute("data-render-frames");
  await page.waitForTimeout(500);
  expect(await canvas.getAttribute("data-render-frames")).toBe(frames);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
  });
  expect(errors).toEqual([]);
});
