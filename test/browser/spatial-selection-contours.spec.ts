import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createLayer, createPage, createSpatialLayer, createSpatialScene } from "@musart/core";
import type * as Witness from "./support/spatial-selection-contours";
import { installReadbackProbe } from "./support/readback-probe";

for (const forceWebGL of [false, true])
  test(`3D white contours track text and shapes across zoom and padded sources on ${forceWebGL ? "WebGL" : "WebGPU"}`, async ({
    page,
    context,
  }) => {
    await installReadbackProbe(page);
    await page.route("**/contour-witness", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Selection contours</title>",
      }),
    );
    await page.goto("/contour-witness");
    const scene = createSpatialScene();
    scene.camera.yaw = 0;
    scene.camera.pitch = 0;
    scene.environment.preset = "none";
    scene.reflections!.mode = "environment";
    const pages = (["rectangle", "text"] as const).map((kind) =>
      createPage({
        width: 259,
        height: 197,
        spatial: scene,
        background: "#000000",
        layers: [
          createLayer(kind, {
            id: kind,
            x: 40,
            y: 50,
            width: 179,
            height: 97,
            text: "O",
            fontSize: 84,
            fontFamily: "Inter",
            fill: "#000000",
            spatial: {
              ...createSpatialLayer(kind === "text" ? "extrude" : "box"),
              curveSegments: 6,
              bevelSegments: 1,
              bevel: 0,
            },
          }),
        ],
      }),
    );
    const result = await page.evaluate(
      async ({ pages, url, forceWebGL }) => {
        const witness = (await import(url)) as typeof Witness;
        return witness.captureSelectionContours(pages, forceWebGL);
      },
      {
        pages,
        forceWebGL,
        url: `/@fs${resolve("test/browser/support/spatial-selection-contours.ts")}`,
      },
    );
    expect(result.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
    const inspector = await context.newPage();
    try {
      const comparisons = await inspector.evaluate(async (results) => {
        const decode = async (src: string) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(image, 0, 0);
          return {
            width: canvas.width,
            height: canvas.height,
            pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
          };
        };
        const comparisons = [];
        for (const result of results) {
          const a = await decode(result.images[0]!),
            b = await decode(result.images[1]!);
          let maximum = 0,
            total = 0,
            visible = 0,
            rowCoverage = 0;
          for (let i = 0; i < a.pixels.length; i++) {
            const d = Math.abs(a.pixels[i]! - b.pixels[i]!);
            maximum = Math.max(maximum, d);
            total += d;
            if (i % 4 === 0 && b.pixels[i]! > 50) visible++;
          }
          const row = Math.floor(b.height / 2);
          for (let x = 0; x < b.width; x++) rowCoverage += b.pixels[(row * b.width + x) * 4]! / 255;
          comparisons.push({
            kind: result.kind,
            zoom: result.zoom,
            density: result.density,
            maximum,
            mean: total / a.pixels.length,
            visible,
            cssStroke: rowCoverage / 2 / (b.width / result.displaySize.width),
          });
        }
        return comparisons;
      }, result.results);
      await mkdir("artifacts/selection-contours", { recursive: true });
      await writeFile(
        `artifacts/selection-contours/${forceWebGL ? "webgl" : "webgpu"}.json`,
        JSON.stringify(
          { comparisons, sizes: result.results.map((r) => r.sizes), reads: result.reads },
          null,
          2,
        ),
      );
      for (const c of comparisons) {
        expect(c.visible).toBeGreaterThan(20);
        expect(c.maximum).toBeLessThanOrEqual(2);
        expect(c.mean).toBeLessThan(0.01);
      }
      const widths = comparisons.filter((c) => c.kind === "rectangle").map((c) => c.cssStroke);
      expect(Math.min(...widths)).toBeGreaterThan(0.5);
      expect(Math.max(...widths)).toBeLessThan(2.25);
      expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(0.8);
    } finally {
      await inspector.close();
    }
  });
