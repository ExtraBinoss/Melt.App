import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
  spatialMaterial,
  type SceneAsset,
} from "@musart/core";
import { spatialGlb } from "./support/spatial-glb";
import { installReadbackProbe } from "./support/readback-probe";

test("imported GLB meshes reflect neighbouring objects with original or overridden materials on both backends", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const data = spatialGlb();
  const asset: SceneAsset = {
    id: "custom-model",
    kind: "model3d",
    name: "Imported tetrahedron",
    mime: "model/gltf-binary",
    width: 1,
    height: 1,
    byteLength: data.byteLength,
    dataUrl: `data:model/gltf-binary;base64,${Buffer.from(data).toString("base64")}`,
    clips: [{ name: "Quarter turn", duration: 1 }],
  };
  const scene = createSpatialScene();
  scene.camera.yaw = 0;
  scene.camera.pitch = 0;
  scene.environment.intensity = 0.7;
  const wall = (id: string, x: number, fill: string) =>
    createLayer("rectangle", {
      id,
      x: 0,
      y: 0,
      width: 256,
      height: 256,
      fill,
      spatial: {
        ...createSpatialLayer("box"),
        x,
        scaleX: 0.03,
        scaleY: 1.2,
        scaleZ: 1.2,
        bevel: 0,
        material: { ...spatialMaterial("clay").settings },
      },
    });
  const project = createProject({
    assets: { [asset.id]: asset },
    pages: [
      createPage({
        id: "model-reflections",
        width: 256,
        height: 256,
        background: "#101014",
        spatial: scene,
        layers: [
          wall("left", -1.1, "#EC3434"),
          wall("right", 1.1, "#30D37C"),
          createLayer("rectangle", {
            id: "imported",
            x: 0,
            y: 0,
            width: 256,
            height: 256,
            fill: "#EEEEEE",
            assetId: asset.id,
            spatial: {
              ...createSpatialLayer("glb"),
              scaleX: 0.7,
              scaleY: 0.7,
              scaleZ: 0.7,
              material: { ...spatialMaterial("chrome").settings, roughness: 0.2 },
            },
          }),
        ],
      }),
    ],
  });
  await installReadbackProbe(page);
  await page.route("**/model-reflection-witness", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>GLB scene reflections</title>",
    }),
  );
  await page.goto("/model-reflection-witness");
  const result = await page.evaluate(
    async (input) => {
      const { createRenderSession } = (await import(
        input.url
      )) as typeof import("../../packages/render/src/index");
      const results = [];
      for (const forceWebGL of [false, true])
        for (const useModelMaterials of [true, false]) {
          const session = createRenderSession({ forceWebGL, maxBytes: 128 * 1024 * 1024 });
          const original = input.project.pages[0]!;
          const p = {
            ...original,
            layers: original.layers.map((layer) =>
              layer.id === "imported"
                ? { ...layer, spatial: { ...layer.spatial!, useModelMaterials } }
                : layer,
            ),
          };
          try {
            const first = await session.withCanvasFrame(p, input.project.assets, (canvas) =>
              canvas.toDataURL("image/png"),
            );
            const changed = await session.withCanvasFrame(
              {
                ...p,
                layers: p.layers.map((layer) =>
                  layer.id === "right" ? { ...layer, fill: "#224BFF" } : layer,
                ),
              },
              input.project.assets,
              (canvas) => canvas.toDataURL("image/png"),
            );
            const stats = session.stats();
            const withoutReflections = {
              ...p,
              spatial: {
                ...p.spatial!,
                reflections: { mode: "environment" as const, quality: "balanced" as const },
              },
            };
            const control = await session.withCanvasFrame(
              withoutReflections,
              input.project.assets,
              (canvas) => canvas.toDataURL("image/png"),
            );
            const controlChanged = await session.withCanvasFrame(
              {
                ...withoutReflections,
                layers: withoutReflections.layers.map((layer) =>
                  layer.id === "right" ? { ...layer, fill: "#224BFF" } : layer,
                ),
              },
              input.project.assets,
              (canvas) => canvas.toDataURL("image/png"),
            );
            results.push({
              forceWebGL,
              useModelMaterials,
              first,
              changed,
              control,
              controlChanged,
              stats,
            });
          } finally {
            await session.dispose();
          }
        }
      return { results, readbacks: window.__musartVideoReadbacks };
    },
    { project, url: `/@fs${resolve("packages/render/src/index.ts")}` },
  );
  expect(result.readbacks).toMatchObject({ gpu: 0, canvas: 0, webgl: 0 });
  const inspect = await browser.newPage();
  try {
    await mkdir("artifacts/scene-reflections/glb", { recursive: true });
    for (const item of result.results) {
      for (const name of ["first", "changed", "control", "controlChanged"] as const)
        await writeFile(
          `artifacts/scene-reflections/glb/${item.forceWebGL}-${item.useModelMaterials}-${name}.png`,
          Buffer.from(item[name].split(",")[1]!, "base64"),
        );
      expect(item.stats?.spatial?.reflections).toMatchObject({
        meshes: 3,
        receivers: 1,
        probes: 1,
        omittedMeshes: 0,
      });
      const changed = await inspect.evaluate(async (item) => {
        const pixels = await Promise.all(
          [item.first, item.changed, item.control, item.controlChanged].map(async (src) => {
            const image = new Image();
            image.src = src;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = 256;
            canvas.height = 256;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(image, 0, 0);
            return ctx.getImageData(80, 75, 96, 115).data;
          }),
        );
        const differences = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
          let changed = 0;
          for (let i = 0; i < a.length; i += 4)
            if (Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!) > 10) changed++;
          return changed;
        };
        return {
          reflected: differences(pixels[0]!, pixels[1]!),
          control: differences(pixels[2]!, pixels[3]!),
        };
      }, item);
      expect(changed.control).toBe(0);
      expect(
        changed.reflected,
        `GLB reflection: ${item.forceWebGL ? "WebGL" : "WebGPU"}, original materials ${item.useModelMaterials}`,
      ).toBeGreaterThan(100);
    }
  } finally {
    await inspect.close();
  }
});
