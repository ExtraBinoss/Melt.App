import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import {
  createEffect,
  createLayer,
  createPage,
  createSpatialLayer,
  createSpatialScene,
} from "@musart/core";
import type * as Witness from "./support/spatial-preview-storage";
import { installReadbackProbe } from "./support/readback-probe";

for (const forceWebGL of [false, true])
  test(`native preview storage preserves ink bleed pixels on ${forceWebGL ? "WebGL" : "WebGPU"}`, async ({
    page,
    context,
  }, info) => {
    await installReadbackProbe(page);
    await page.route("**/storage-witness", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Storage witness</title>",
      }),
    );
    await page.goto("/storage-witness");
    const scene = createSpatialScene();
    scene.environment.preset = "none";
    scene.reflections!.mode = "environment";
    scene.camera.pitch = 9;
    const composition = createPage({
      width: 259,
      height: 197,
      spatial: scene,
      background: "#eeeeee",
      layers: [
        createLayer("text", {
          x: 30,
          y: 60,
          width: 199,
          height: 77,
          text: "Ink",
          fontFamily: "Inter",
          fontSize: 54,
          fill: "#234577",
          spatial: { ...createSpatialLayer("extrude"), curveSegments: 3, bevelSegments: 1 },
          effects: [createEffect("ink-bleed")],
        }),
      ],
    });
    const result = await page.evaluate(
      async ({ composition, url, forceWebGL }) => {
        const witness = (await import(url)) as typeof Witness;
        return witness.capturePreviewStorage(composition, forceWebGL);
      },
      {
        composition,
        forceWebGL,
        url: `/@fs${resolve("test/browser/support/spatial-preview-storage.ts")}`,
      },
    );
    const [preview, exact] = result.results;
    expect(preview!.backend).toBe(forceWebGL ? "webgl" : "webgpu");
    expect(preview!.allocations).toBeLessThan(exact!.allocations);
    expect(
      preview!.snapshots.some((s) => s.used[0] !== s.capacity[0] || s.used[1] !== s.capacity[1]),
    ).toBe(true);
    expect(
      exact!.snapshots.every((s) => s.used[0] === s.capacity[0] && s.used[1] === s.capacity[1]),
    ).toBe(true);
    expect(result.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
    const inspector = await context.newPage();
    try {
      const differences = await inspector.evaluate(
        async ({ preview, exact }) => {
          const decode = async (src: string) => {
            const image = new Image();
            image.src = src;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(image, 0, 0);
            return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          };
          const results = [];
          for (let i = 0; i < preview.length; i++) {
            const a = await decode(preview[i]!),
              b = await decode(exact[i]!);
            let maximum = 0,
              total = 0,
              colored = 0;
            for (let p = 0; p < a.length; p++) {
              const difference = Math.abs(a[p]! - b[p]!);
              maximum = Math.max(maximum, difference);
              total += difference;
              if (p % 4 === 0 && a[p]! < 200) colored++;
            }
            results.push({ maximum, mean: total / a.length, colored });
          }
          return results;
        },
        { preview: preview!.images, exact: exact!.images },
      );
      expect(differences.every((d) => d.colored > 100)).toBe(true);
      expect(differences.every((d) => d.maximum <= 2 && d.mean < 0.01)).toBe(true);
      await info.attach("preview-storage", {
        body: JSON.stringify({
          allocations: result.results.map((r) => r.allocations),
          snapshots: preview!.snapshots,
          differences,
          reads: result.reads,
        }),
        contentType: "application/json",
      });
    } finally {
      await inspector.close();
    }
  });
