import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { installWebGLFrameSnapshot, nativeWebGLFrame } from "./support/webgl-frame-snapshot";
import { zoomViewport } from "./support/viewport";

for (const fallback of [false, true])
  test(`SVG edges on the infinite canvas have real coverage without changing exact export (${fallback ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await installReadbackProbe(page);
    if (fallback) {
      await installWebGLFrameSnapshot(page);
      await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined }));
    }
    await page.addInitScript(() => {
      localStorage.setItem("musart.language", "en");
      localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    });
    await page.goto("/editor?automation=1");
    await page.waitForFunction(() => Boolean(window.musart));
    const project = createProject({
      id: `svg-coverage-${fallback}`,
      pages: [
        createPage({
          width: 128,
          height: 96,
          background: "transparent",
          layers: [
            createLayer("vector", {
              id: "curved-svg",
              x: 0,
              y: 0,
              width: 128,
              height: 96,
              fill: "#8b5cf6",
              vector: {
                viewBox: "0 0 128 96",
                path: "M5.3 6.1L65.7 87.4L121.8 12.7Z M48 30C17 12 10 70 48 73C82 83 80 17 48 30Z",
              },
            }),
          ],
        }),
      ],
    });
    await page.evaluate((project) => window.musart!.load(project), project);
    const canvas = page.locator(".editor-gpu-scene canvas"),
      inspection = await page.context().newPage();
    await page.bringToFront();
    const rows = [];
    try {
      for (const scale of [1, 2]) {
        await page.getByTestId("artboard").hover();
        await zoomViewport(page, scale);
        await page.waitForFunction(
          ({ id, scale }) => {
            const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas"),
              d = canvas?.dataset;
            return (
              d?.projectId === id &&
              d.rendererReady === "true" &&
              d.sceneRevision === d.renderedRevision &&
              Number(d.renderWidth) === 128 * scale
            );
          },
          { id: project.id, scale },
        );
        expect(await canvas.getAttribute("data-backend")).toBe(fallback ? "webgl" : "webgpu");
        const live = fallback
            ? (await nativeWebGLFrame(page, project.id)).dataUrl
            : await canvas.evaluate((element) =>
                (element as HTMLCanvasElement).toDataURL("image/png"),
              ),
          exact = await page.evaluate((scale) => window.musart!.render({ scale }), scale),
          reference = await page.evaluate(() => window.musart!.render({ scale: 8 }));
        const metrics = await inspection.evaluate(
          async ({ live, exact, reference, scale }) => {
            const width = 128 * scale,
              height = 96 * scale;
            const decode = async (src: string) => {
              const image = new Image();
              image.src = src;
              await image.decode();
              const canvas = document.createElement("canvas");
              canvas.width = width;
              canvas.height = height;
              const context = canvas.getContext("2d")!;
              context.imageSmoothingEnabled = true;
              context.imageSmoothingQuality = "high";
              context.drawImage(image, 0, 0, width, height);
              return {
                width: image.width,
                height: image.height,
                data: context.getImageData(0, 0, width, height).data,
              };
            };
            const [candidate, baseline, truth] = await Promise.all([
              decode(live),
              decode(exact),
              decode(reference),
            ]);
            const error = (data: Uint8ClampedArray) => {
              let square = 0,
                coverage = 0;
              for (let i = 3; i < data.length; i += 4) {
                square += (data[i]! - truth.data[i]!) ** 2;
                if (data[i]! > 0 && data[i]! < 255) coverage++;
              }
              return { rms: Math.sqrt(square / (width * height)), coverage };
            };
            return {
              size: [candidate.width, candidate.height],
              preview: error(candidate.data),
              exact: error(baseline.data),
            };
          },
          { live, exact, reference, scale },
        );
        expect(metrics.size).toEqual([128 * scale, 96 * scale]);
        expect(metrics.preview.coverage).toBeGreaterThan(80 * scale);
        expect(metrics.preview.rms).toBeLessThan(metrics.exact.rms * 0.8);
        // The preview must not contaminate the exact/export retained cache.
        expect(await page.evaluate((scale) => window.musart!.render({ scale }), scale)).toBe(exact);
        rows.push({ scale, ...metrics });
      }
      await mkdir("artifacts/vector-inline", { recursive: true });
      await page.screenshot({
        path: `artifacts/vector-inline/svg-coverage-${fallback ? "webgl" : "webgpu"}.png`,
      });
      await writeFile(
        `artifacts/vector-inline/svg-coverage-${fallback ? "webgl" : "webgpu"}.json`,
        JSON.stringify(rows, null, 2),
      );
      expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
        gpu: 0,
        webgl: 0,
        canvas: 0,
      });
    } finally {
      await page.evaluate(() => window.__stopLiveWebGLSnapshot?.());
      await inspection.close();
    }
  });
