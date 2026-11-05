import { expect, test } from "@playwright/test";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
} from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

test("Studio keeps the same white silhouette visible through press and selection, then idles over the selected item", async ({
  page,
  context,
}) => {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  const scene = createSpatialScene();
  scene.camera.yaw = 0;
  scene.camera.pitch = 0;
  scene.environment.preset = "none";
  scene.reflections!.mode = "environment";
  const spatial = createSpatialLayer("sphere");
  spatial.material.roughness = 1;
  spatial.material.clearcoat = 0;
  const project = createProject({
    pages: [
      createPage({
        width: 320,
        height: 240,
        background: "#101015",
        spatial: scene,
        layers: [
          createLayer("ellipse", {
            id: "sphere",
            x: 60,
            y: 20,
            width: 200,
            height: 200,
            fill: "#174488",
            spatial,
          }),
        ],
      }),
    ],
  });
  await page.goto("/editor?automation=1&workspace=studio");
  await page.waitForFunction(() => !!window.musart);
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select([]);
  }, project);
  await page.waitForFunction(() => {
    const c = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
    return (
      c?.dataset.presentationReady === "true" &&
      c.dataset.sceneRevision === c.dataset.renderedRevision
    );
  });
  await page.mouse.move(0, 0);
  const canvas = page.locator(".editor-gpu-scene canvas");
  const base = await canvas.screenshot();
  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  const frames = Number(await canvas.getAttribute("data-render-frames"));
  await page.mouse.move(x, y);
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-render-frames")))
    .toBeGreaterThan(frames);
  const hovered = await canvas.screenshot();
  await page.mouse.down();
  try {
    await page.waitForTimeout(100);
    const pressed = await canvas.screenshot();
    await page.mouse.up();
    await expect
      .poll(() => page.evaluate(() => window.musart!.session().selection))
      .toEqual(["sphere"]);
    await page.mouse.move(x + 1, y);
    await page.waitForTimeout(220);
    const selected = await canvas.screenshot();
    const idle = await canvas.getAttribute("data-render-frames");
    await page.waitForTimeout(220);
    expect(await canvas.getAttribute("data-render-frames")).toBe(idle);
    expect(await page.evaluate(() => window.musart!.session().canUndo)).toBe(false);
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
    const inspector = await context.newPage();
    try {
      const counts = await inspector.evaluate(
        async (images) => {
          const counts: number[] = [];
          for (const src of images) {
            const image = new Image();
            image.src = src;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(image, 0, 0);
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let white = 0;
            for (let p = 0; p < pixels.length; p += 4)
              if (Math.min(pixels[p]!, pixels[p + 1]!, pixels[p + 2]!) > 60) white++;
            counts.push(white);
          }
          return counts;
        },
        [base, hovered, pressed, selected].map(
          (image) => `data:image/png;base64,${image.toString("base64")}`,
        ),
      );
      const [plain, hover, press, selection] = counts as [number, number, number, number];
      expect(hover - plain).toBeGreaterThan(30);
      expect(press - plain).toBeGreaterThan((hover - plain) * 0.5);
      expect(selection - plain).toBeGreaterThan((hover - plain) * 0.5);
    } finally {
      await inspector.close();
    }
  } finally {
    await page.mouse.up();
  }
});
