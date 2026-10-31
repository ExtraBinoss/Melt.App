import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
  createSpatialLight,
  spatialMaterial,
} from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";
test("shared native directional and point shadows follow exact composition samples on both backends", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await installReadbackProbe(page);
  await page.route("**/shadow-witness", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Shared native shadows</title>",
    }),
  );
  await page.goto("/shadow-witness");
  const scene = createSpatialScene();
  scene.camera.yaw = 0;
  scene.camera.pitch = 35;
  scene.environment.preset = "none";
  scene.reflections!.mode = "environment";
  scene.shadows = true;
  scene.lights = [{ ...createSpatialLight(), x: -2, y: 3, z: 1, castShadow: true, intensity: 3 }];
  const project = createProject({
    pages: [
      createPage({
        id: "shared-shadow",
        width: 256,
        height: 256,
        background: "#FFFFFF",
        spatial: scene,
        layers: [
          createLayer("rectangle", {
            id: "block",
            x: 0,
            y: 0,
            width: 256,
            height: 256,
            fill: "#FFFFFF",
            spatial: {
              ...createSpatialLayer("box"),
              y: -0.24,
              scaleX: 0.4,
              scaleY: 0.4,
              scaleZ: 0.4,
              bevel: 0,
              material: { ...spatialMaterial("clay").settings },
            },
          }),
          createLayer("rectangle", {
            id: "floor",
            x: 0,
            y: 0,
            width: 256,
            height: 256,
            fill: "#FFFFFF",
            spatial: {
              ...createSpatialLayer("box"),
              y: -0.62,
              scaleX: 1.2,
              scaleY: 0.02,
              scaleZ: 1.2,
              bevel: 0,
              material: { ...spatialMaterial("clay").settings },
            },
          }),
        ],
      }),
    ],
  });
  const result = await page.evaluate(
    async (input) => {
      const { createRenderSession } = (await import(
        input.url
      )) as typeof import("../../packages/render/src/index");
      const images: { forceWebGL: boolean; type: string; on: string; off: string }[] = [];
      for (const forceWebGL of [false, true])
        for (const type of ["directional", "point"] as const) {
          const session = createRenderSession({ forceWebGL, maxBytes: 128 * 1024 * 1024 });
          const original = input.project.pages[0]!;
          const p = {
            ...original,
            spatial: {
              ...original.spatial!,
              lights: original.spatial!.lights.map((light) => ({
                ...light,
                type,
                intensity: type === "point" ? 18 : 3,
              })),
            },
          };
          try {
            const on = await session.withCanvasFrame(p, input.project.assets, (canvas) =>
              canvas.toDataURL("image/png"),
            );
            const off = await session.withCanvasFrame(
              {
                ...p,
                layers: p.layers.map((layer) =>
                  layer.id === "block"
                    ? { ...layer, spatial: { ...layer.spatial!, castShadow: false } }
                    : layer,
                ),
              },
              input.project.assets,
              (canvas) => canvas.toDataURL("image/png"),
            );
            images.push({ forceWebGL, type, on, off });
          } finally {
            await session.dispose();
          }
        }
      return { images, readbacks: window.__musartVideoReadbacks };
    },
    { project, url: `/@fs${resolve("packages/render/src/index.ts")}` },
  );
  expect(result.readbacks).toMatchObject({ gpu: 0, canvas: 0, webgl: 0 });
  const inspection = await browser.newPage();
  try {
    for (const images of result.images) {
      const changed = await inspection.evaluate(async (images) => {
        const pixels = await Promise.all(
          [images.on, images.off].map(async (src) => {
            const image = new Image();
            image.src = src;
            await image.decode();
            const c = document.createElement("canvas");
            c.width = 256;
            c.height = 256;
            const ctx = c.getContext("2d")!;
            ctx.drawImage(image, 0, 0);
            return ctx.getImageData(170, 145, 50, 50).data;
          }),
        );
        let changed = 0;
        for (let i = 0; i < pixels[0]!.length; i += 4)
          if (pixels[1]![i]! - pixels[0]![i]! > 20) changed++;
        return changed;
      }, images);
      expect(
        changed,
        `${images.type} ${images.forceWebGL ? "WebGL" : "WebGPU"} shadow must affect the separate floor`,
      ).toBeGreaterThan(50);
    }
  } finally {
    await inspection.close();
  }
});
