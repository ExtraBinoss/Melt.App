import { expect, test } from "@playwright/test";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
} from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

for (const workspace of ["classic", "studio"])
  test(`reflected 3D layers remain visible around frontal Y rotation in ${workspace}`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installReadbackProbe(page);
    await page.addInitScript(() => {
      localStorage.setItem("musart.language", "en");
      localStorage.setItem("musart.editor-tutorial.v1", "done");
      localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    });
    await page.goto(`/editor?automation=1&workspace=${workspace}`);
    await page.waitForFunction(() => !!window.musart);
    const inspection = await browser.newPage();
    const coloredPixels = (url: string) =>
      inspection.evaluate(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;
        for (let i = 0; i < data.length; i += 4)
          if (data[i + 1]! > data[i]! + 20 && data[i + 1]! > data[i + 2]! + 20) count++;
        return count;
      }, url);
    try {
      for (const rotationY of [-10, -7, 0, 87, 90]) {
        const scene = createSpatialScene();
        scene.reflections!.mode = "environment";
        const project = createProject({
          pages: [
            createPage({
              width: 600,
              height: 600,
              spatial: scene,
              layers: [
                createLayer("rectangle", {
                  id: "vase",
                  affine: [-1, 0, 0, 1],
                  x: 150,
                  y: 150,
                  width: 300,
                  height: 300,
                  fill: "#22cc55",
                  spatial: {
                    ...createSpatialLayer("lathe"),
                    x: 0.28,
                    y: 0.89,
                    z: 0.3,
                    scaleX: 1.8,
                    scaleY: 1.8,
                    scaleZ: 1.8,
                    rotationY,
                  },
                }),
              ],
            }),
          ],
        });
        await page.evaluate((project) => window.musart!.load(project), project);
        await page.waitForFunction(() => {
          const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
          return (
            canvas?.dataset.presentationReady === "true" &&
            canvas.dataset.sceneRevision === canvas.dataset.renderedRevision
          );
        });
        const screenshot = await page.locator(".editor-gpu-scene canvas").screenshot();
        expect(
          await coloredPixels(`data:image/png;base64,${screenshot.toString("base64")}`),
        ).toBeGreaterThan(1000);
        // Exact exports use the same scene, including the WebGL fallback.
        if (rotationY === -7)
          for (const forceWebGL of [false, true]) {
            const png = await page.evaluate(
              (forceWebGL) => window.musart!.render({ format: "png", scale: 0.5, forceWebGL }),
              forceWebGL,
            );
            expect(await coloredPixels(png)).toBeGreaterThan(5000);
          }
      }
      expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
        gpu: 0,
        canvas: 0,
        webgl: 0,
      });
      expect(errors).toEqual([]);
    } finally {
      await inspection.close();
    }
  });
