import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import {
  createEffect,
  createLayer,
  createPage,
  createSpatialLayer,
  createSpatialScene,
  createSpatialLight,
  spatialMaterial,
  selectionComposition,
  type Composition,
} from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

function fixture(opacity = 0.5, fill = "#20CF66"): Composition {
  const scene = createSpatialScene();
  scene.camera.yaw = 0;
  scene.camera.pitch = 0;
  scene.environment.preset = "none";
  scene.reflections!.mode = "environment";
  return createPage({
    id: "native-opacity",
    width: 128,
    height: 128,
    spatial: scene,
    background: "#FFFFFF",
    layers: [
      createLayer("rectangle", {
        id: "rear",
        x: 0,
        y: 0,
        width: 128,
        height: 128,
        fill,
        spatial: { ...createSpatialLayer("box"), z: -0.5, scaleX: 0.8, scaleY: 0.8, scaleZ: 0.5 },
      }),
      createLayer("rectangle", {
        id: "front",
        x: 0,
        y: 0,
        width: 128,
        height: 128,
        fill: "#E51B35",
        opacity,
        spatial: { ...createSpatialLayer("box"), z: 0.5, scaleX: 0.5, scaleY: 0.5, scaleZ: 0.5 },
      }),
    ],
  });
}
const delta = (a: number[], b: number[]) =>
  a.reduce((sum, value, i) => sum + Math.abs(value - b[i]!), 0);

test("native layer, material and isolated group alpha reveal rear contributions on both backends", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const variants: Record<string, Composition> = {};
  for (const [color, fill] of [
    ["green", "#20CF66"],
    ["blue", "#224BFF"],
  ] as const) {
    for (const opacity of [0, 0.5, 1]) variants[`${color}-${opacity}`] = fixture(opacity, fill);
    const material = fixture(1, fill);
    variants[`${color}-material`] = {
      ...material,
      layers: material.layers.map((layer) =>
        layer.id === "front"
          ? {
              ...layer,
              spatial: {
                ...layer.spatial!,
                material: { ...layer.spatial!.material, opacity: 0.5 },
              },
            }
          : layer,
      ),
    };
    const inverted = fixture(0.5, fill);
    variants[`${color}-effect`] = {
      ...inverted,
      layers: inverted.layers.map((layer) =>
        layer.id === "front"
          ? {
              ...layer,
              effects: [createEffect("invert")],
            }
          : layer,
      ),
    };
    const group = createLayer("group", {
      id: "fade",
      x: 0,
      y: 0,
      width: 128,
      height: 128,
      opacity: 0.5,
      spatial: createSpatialLayer("group"),
    });
    const inner = fixture(1).layers.map((layer) => ({ ...layer, parentId: group.id }));
    const outside = {
      ...fixture(1, fill).layers[0]!,
      id: "outside",
      spatial: {
        ...fixture().layers[0]!.spatial!,
        z: -1.5,
      },
    };
    variants[`${color}-group`] = { ...fixture(), layers: [outside, group, ...inner] };
    variants[`${color}-group-reversed`] = {
      ...fixture(),
      layers: [outside, group, ...[...inner].reverse()],
    };
    variants[`${color}-group-inner-color`] = {
      ...fixture(),
      layers: [
        outside,
        group,
        ...inner.map((layer) =>
          layer.id === "rear"
            ? {
                ...layer,
                fill: "#224BFF",
              }
            : layer,
        ),
      ],
    };
  }
  const half = fixture();
  variants.reversed = { ...half, layers: [...half.layers].reverse() };
  const mask = createLayer("rectangle", {
    id: "mask",
    x: 0,
    y: 0,
    width: 24,
    height: 128,
    fill: "#FFFFFF",
    maskSource: true,
  });
  for (const opacity of [0.5, 1]) {
    const masked = fixture(opacity);
    variants[`mask-${opacity}`] = {
      ...masked,
      layers: [
        mask,
        ...masked.layers.map((layer) =>
          layer.id === "front"
            ? {
                ...layer,
                mask: { layerId: mask.id, enabled: true, inverted: false },
              }
            : layer,
        ),
      ],
    };
  }
  variants["selected-half"] = selectionComposition(half, ["front"], [], { centerInArtboard: true });
  variants["selected-rear-partial-context"] = selectionComposition(half, ["rear"], [], {
    centerInArtboard: true,
  });
  variants["selected-rear-opaque-context"] = selectionComposition(fixture(1), ["rear"], [], {
    centerInArtboard: true,
  });
  await installReadbackProbe(page);
  await page.route("**/opacity-witness", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Native opacity witness</title>",
    }),
  );
  await page.goto("/opacity-witness");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const result = await page.evaluate(
    async (input) => {
      const { createRenderSession } = (await import(
        input.url
      )) as typeof import("../../packages/render/src/index");
      const backends: Record<string, string>[] = [];
      for (const forceWebGL of [false, true]) {
        const session = createRenderSession({ forceWebGL, maxBytes: 128 * 1024 * 1024 });
        const images: Record<string, string> = {};
        try {
          // Consecutive exact samples intentionally run within the same browser RAF.
          for (const [name, composition] of Object.entries(input.variants))
            images[name] = await session.withCanvasFrame(
              composition,
              {},
              (canvas) => canvas.toDataURL("image/png"),
              { mediaMode: "exact" },
            );
        } finally {
          await session.dispose();
        }
        backends.push(images);
      }
      return { backends, readbacks: window.__musartVideoReadbacks };
    },
    { variants, url: `/@fs${resolve("packages/render/src/index.ts")}` },
  );
  expect(result.readbacks).toMatchObject({ gpu: 0, canvas: 0, webgl: 0 });
  const inspector = await browser.newPage();
  try {
    for (const images of result.backends) {
      const pixels = await inspector.evaluate(async (sources) => {
        const pixels: Record<string, number[]> = {};
        for (const [name, src] of Object.entries(sources)) {
          const image = new Image();
          image.src = src;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext("2d")!;
          context.drawImage(image, 0, 0);
          pixels[name] = [...context.getImageData(64, 64, 1, 1).data];
        }
        return pixels;
      }, images);
      const at = (name: string) => pixels[name]!;
      expect(delta(at("green-0.5"), at("blue-0.5"))).toBeGreaterThan(40);
      expect(delta(at("green-0"), at("blue-0"))).toBeGreaterThan(100);
      expect(at("green-1")).toEqual(at("blue-1"));
      expect(delta(at("green-material"), at("blue-material"))).toBeGreaterThan(40);
      expect(delta(at("green-effect"), at("blue-effect"))).toBeGreaterThan(40);
      expect(delta(at("green-effect"), at("green-0.5"))).toBeGreaterThan(40);
      expect(at("reversed")).toEqual(at("green-0"));
      expect(at("mask-0.5")).toEqual(at("green-0"));
      expect(at("mask-1")).toEqual([255, 255, 255, 255]);
      for (const color of ["green", "blue"]) {
        expect(at(`${color}-group`)).toEqual(at(`${color}-group-reversed`));
        expect(at(`${color}-group`)).toEqual(at(`${color}-group-inner-color`));
      }
      expect(delta(at("green-group"), at("blue-group"))).toBeGreaterThan(40);
      expect(at("selected-half")[3]).toBeGreaterThan(120);
      expect(at("selected-half")[3]).toBeLessThan(136);
      expect(at("selected-rear-partial-context")[3]).toBe(255);
      expect(at("selected-rear-opaque-context")[3]).toBe(0);
    }
  } finally {
    await inspector.close();
  }
  expect(errors).toEqual([]);
});

test("faded depth scopes preserve shared directional and point shadows across exact samples", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const scene = createSpatialScene();
  scene.camera.yaw = 0;
  scene.camera.pitch = 35;
  scene.environment.preset = "none";
  scene.reflections!.mode = "environment";
  scene.shadows = true;
  scene.lights = [{ ...createSpatialLight(), x: -2, y: 3, z: 1, castShadow: true, intensity: 3 }];
  const composition = createPage({
    id: "faded-shadow",
    width: 256,
    height: 256,
    background: "#FFFFFF",
    spatial: scene,
    layers: [
      createLayer("group", {
        id: "fade",
        x: 0,
        y: 0,
        width: 256,
        height: 256,
        opacity: 0.5,
        spatial: createSpatialLayer("group"),
      }),
      createLayer("rectangle", {
        id: "block",
        parentId: "fade",
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
  });
  await installReadbackProbe(page);
  await page.route("**/opacity-shadow-witness", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Faded shared shadows</title>",
    }),
  );
  await page.goto("/opacity-shadow-witness");
  const outputs = await page.evaluate(
    async (input) => {
      const { createRenderSession } = (await import(
        input.url
      )) as typeof import("../../packages/render/src/index");
      const outputs: { on: string; off: string; restored: string }[] = [];
      for (const forceWebGL of [false, true]) {
        const session = createRenderSession({ forceWebGL, maxBytes: 128 * 1024 * 1024 });
        try {
          for (const type of ["directional", "point"] as const) {
            const composition = {
              ...input.composition,
              spatial: {
                ...input.composition.spatial!,
                lights: input.composition.spatial!.lights.map((light) => ({
                  ...light,
                  type,
                  intensity: type === "point" ? 18 : 3,
                })),
              },
            };
            const capture = (composition: typeof input.composition) =>
              session.withCanvasFrame(composition, {}, (canvas) => canvas.toDataURL("image/png"), {
                mediaMode: "exact",
              });
            const on = await capture(composition);
            const off = await capture({
              ...composition,
              layers: composition.layers.map((layer) =>
                layer.id === "block"
                  ? { ...layer, spatial: { ...layer.spatial!, castShadow: false } }
                  : layer,
              ),
            });
            const restored = await capture(composition);
            outputs.push({ on, off, restored });
          }
        } finally {
          await session.dispose();
        }
      }
      return { outputs, readbacks: window.__musartVideoReadbacks };
    },
    { composition, url: `/@fs${resolve("packages/render/src/index.ts")}` },
  );
  expect(outputs.readbacks).toMatchObject({ gpu: 0, canvas: 0, webgl: 0 });
  const inspector = await browser.newPage();
  try {
    for (const output of outputs.outputs) {
      expect(output.restored).toBe(output.on);
      const changed = await inspector.evaluate(async (sources) => {
        const pixels = await Promise.all(
          [sources.on, sources.off].map(async (src) => {
            const image = new Image();
            image.src = src;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = 256;
            canvas.height = 256;
            const context = canvas.getContext("2d")!;
            context.drawImage(image, 0, 0);
            return context.getImageData(170, 145, 50, 50).data;
          }),
        );
        let changed = 0;
        for (let i = 0; i < pixels[0]!.length; i += 4)
          if (pixels[1]![i]! - pixels[0]![i]! > 20) changed++;
        return changed;
      }, output);
      expect(changed).toBeGreaterThan(50);
    }
  } finally {
    await inspector.close();
  }
});
