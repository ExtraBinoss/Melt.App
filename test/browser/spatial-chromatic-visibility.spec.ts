import { expect, test } from "@playwright/test";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
} from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

for (const workspace of ["classic", "studio"])
  test(`chromatic aberration retains extruded sides across the face horizon in ${workspace}`, async ({
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
    const inspector = await browser.newPage();
    const coverage = (urls: string[]) =>
      inspector.evaluate(async (urls) => {
        const counts = [];
        for (const src of urls) {
          const image = new Image();
          image.src = src;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(image, 0, 0);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let alpha = 0,
            green = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i + 3]! > 100) alpha++;
            if (pixels[i + 1]! > pixels[i]! + 20 && pixels[i + 1]! > pixels[i + 2]! + 20) green++;
          }
          counts.push({ alpha, green });
        }
        return counts;
      }, urls);
    try {
      for (const rotationY of [-10, -7, 0, 87, 90]) {
        const scene = createSpatialScene();
        scene.camera.yaw = 83;
        scene.camera.pitch = 0;
        scene.reflections!.mode = "environment";
        const exports: string[][] = [[], []];
        const screenshots: string[] = [];
        for (const enabled of [false, true]) {
          const project = createProject({
            pages: [
              createPage({
                width: 600,
                height: 600,
                background: "transparent",
                spatial: scene,
                layers: [
                  createLayer("vector", {
                    id: "object",
                    x: 150,
                    y: 150,
                    width: 300,
                    height: 300,
                    fill: "#22cc55",
                    vector: {
                      viewBox: "0 0 100 100",
                      preserveColors: false,
                      parts: [{ path: "M0 0H100V100H0Z", fill: "#22cc55" }],
                    },
                    spatial: {
                      ...createSpatialLayer("extrude"),
                      x: 0.28,
                      y: 0.89,
                      z: 0.3,
                      scaleX: 1.8,
                      scaleY: 1.8,
                      scaleZ: 1.8,
                      rotationY,
                    },
                    effects: enabled ? [createEffect("chromatic-aberration")] : [],
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
          screenshots.push(`data:image/png;base64,${screenshot.toString("base64")}`);
          for (const forceWebGL of rotationY === -7 ? [false, true] : [false])
            exports[Number(forceWebGL)]!.push(
              await page.evaluate(
                (forceWebGL) => window.musart!.render({ format: "png", scale: 0.5, forceWebGL }),
                forceWebGL,
              ),
            );
        }
        const visible = await coverage(screenshots);
        expect(visible[0]!.green).toBeGreaterThan(500);
        expect(visible[1]!.green).toBeGreaterThan(visible[0]!.green * 0.9);
        for (const urls of exports) {
          if (!urls.length) continue;
          const counts = await coverage(urls);
          expect(counts[0]!.alpha).toBeGreaterThan(5000);
          expect(counts[1]!.alpha / counts[0]!.alpha).toBeGreaterThan(0.95);
          expect(counts[1]!.alpha / counts[0]!.alpha).toBeLessThan(1.05);
        }
      }
      expect(errors).toEqual([]);
      expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
        gpu: 0,
        canvas: 0,
        webgl: 0,
      });
    } finally {
      await inspector.close();
    }
  });
