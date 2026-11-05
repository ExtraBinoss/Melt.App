import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
} from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

test("Studio keeps its compact bar, exposes text bounds and linked axes in advanced controls, and anchors insertion at native input", async ({
  page,
}) => {
  test.setTimeout(60000);
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  await page.goto("/editor?automation=1&workspace=studio");
  await page.waitForFunction(() => !!window.musart);
  const scene = createSpatialScene();
  scene.environment.preset = "none";
  scene.reflections!.mode = "environment";
  scene.camera.yaw = scene.camera.pitch = 0;
  const spatial = createSpatialLayer("extrude");
  spatial.bevel = 0;
  spatial.curveSegments = 4;
  const project = createProject({
    pages: [
      createPage({
        width: 480,
        height: 320,
        background: "#292929",
        spatial: scene,
        layers: [
          createLayer("text", {
            id: "text",
            text: "TEXT",
            x: 100,
            y: 120,
            width: 280,
            height: 90,
            fontSize: 48,
            spatial,
          }),
        ],
      }),
    ],
  });
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["text"]);
  }, project);
  const canvas = page.locator(".editor-gpu-scene canvas");
  const ready = () =>
    page.waitForFunction(
      () =>
        document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset
          .rendererReady === "true",
    );
  await ready();
  const bar = page.locator(".studio-object-bar");
  await expect(bar.getByRole("textbox", { name: "Text content", exact: true })).toBeVisible();
  expect((await bar.boundingBox())!.height).toBeLessThan(80);
  await expect(bar.getByRole("textbox", { name: "Scale X" })).toHaveCount(0);
  await expect(bar.getByRole("textbox", { name: "Width", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Advanced", exact: true }).click();
  const advanced = page.locator(".studio-object-popover");
  await expect(advanced.getByRole("textbox", { name: "Scale X" })).toBeVisible();
  const width = advanced.getByRole("textbox", { name: "Width", exact: true });
  await width.fill("450");
  await width.press("Enter");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.width))
    .toBe(450);
  await page.keyboard.press("Escape");
  await ready();
  const original = await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project));
  const before = await canvas.getAttribute("data-render-count");
  const counters = () =>
    page
      .locator(".musart-app,.canvas-area,.editor-canvas,.editor-gpu-scene")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-react-renders")));
  const counts = await counters();
  const field = bar.getByRole("textbox", { name: "Text content", exact: true });
  await page.evaluate(() => {
    const canvas = document.querySelector(".editor-gpu-scene canvas")!;
    const samples = {
      firstInput: 0,
      lastInput: 0,
      frames: [] as { sinceFirstInput: number; sinceLastInput: number }[],
    };
    const input = () => {
      samples.firstInput ||= performance.now();
      samples.lastInput = performance.now();
    };
    const observer = new MutationObserver(() => {
      if (samples.firstInput)
        samples.frames.push({
          sinceFirstInput: performance.now() - samples.firstInput,
          sinceLastInput: performance.now() - samples.lastInput,
        });
    });
    observer.observe(canvas, { attributes: true, attributeFilter: ["data-rendered-revision"] });
    document.addEventListener("input", input, true);
    Object.assign(window, {
      __typingSamples: samples,
      __stopTyping: () => {
        observer.disconnect();
        document.removeEventListener("input", input, true);
      },
    });
  });
  await field.fill("");
  await field.pressSequentially("FAST TYPING", { delay: 12 });
  await expect(field).toHaveValue("FAST TYPING");
  await expect.poll(() => canvas.getAttribute("data-render-count")).not.toBe(before);
  expect(await counters()).toEqual(counts);
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(
    original,
  );
  const samples = await page.evaluate(() => {
    const probe = window as unknown as { __typingSamples: unknown; __stopTyping: () => void };
    probe.__stopTyping();
    return probe.__typingSamples;
  });
  await writeFile(
    "artifacts/studio-interactions-typing.json",
    JSON.stringify(
      { samples, environment: "Development server, Chromium, 50% of one CPU, 480x320 native text" },
      null,
      2,
    ),
  );
  await field.press("Enter");
  await ready();
  await page.evaluate(() => window.musart!.undo());
  await ready();
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(
    original,
  );
  await page.screenshot({ path: "artifacts/studio-interactions-bar.png" });
  const viewport = (await page.getByTestId("editor-canvas").boundingBox())!;
  const point = { x: viewport.x + 160, y: viewport.y + 160 };
  await page.mouse.dblclick(point.x, point.y);
  const menu = page.locator(".quick-add-popover");
  await expect(menu).toBeVisible();
  const bounds = (await menu.boundingBox())!;
  expect(Math.abs(bounds.x - point.x)).toBeLessThan(5);
  expect(Math.abs(bounds.y - point.y)).toBeLessThan(10);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});
