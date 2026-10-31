import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
} from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";
import { createCornellBox } from "../../apps/web/src/services/projects/templates/motion/cornell-box";

test("one composition shares native depth across layer ordering on both backends", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("scene-error", e.message);
  });
  page.on("console", (m) => {
    if (m.type() === "error" || m.text().startsWith("scene-witness"))
      console.log("scene-console", m.text());
  });
  await installReadbackProbe(page);
  await page.route("**/scene-witness", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Native composition witness</title>",
    }),
  );
  await page.goto("/scene-witness");
  const scene = createSpatialScene();
  scene.camera.yaw = 0;
  scene.camera.pitch = 0;
  scene.reflections!.mode = "environment";
  scene.environment.preset = "none";
  const front = { ...createSpatialLayer("box"), z: 0.5, scaleX: 0.5, scaleY: 0.5, scaleZ: 0.5 };
  const rear = { ...createSpatialLayer("box"), z: -0.5, scaleX: 0.8, scaleY: 0.8, scaleZ: 0.5 };
  const project = createProject({
    pages: [
      createPage({
        id: "shared-depth",
        width: 256,
        height: 256,
        background: "#FFFFFF",
        spatial: scene,
        layers: [
          createLayer("rectangle", {
            id: "front",
            x: 0,
            y: 0,
            width: 256,
            height: 256,
            fill: "#E51B35",
            spatial: front,
          }),
          createLayer("rectangle", {
            id: "rear",
            x: 0,
            y: 0,
            width: 256,
            height: 256,
            fill: "#20CF66",
            spatial: rear,
          }),
        ],
      }),
    ],
  });
  const result = await page.evaluate(
    async (input) => {
      const { createRenderSession } = (await import(
        input.renderUrl
      )) as typeof import("../../packages/render/src/index");
      console.info("scene-witness: imported");
      const outputs: { images: string[]; stats: unknown }[] = [];
      for (const forceWebGL of [false, true]) {
        const session = createRenderSession({ forceWebGL, maxBytes: 128 * 1024 * 1024 });
        const images: string[] = [];
        try {
          const original = input.project.pages[0]!;
          const p3 = { ...original, colorSpace: "display-p3" as const };
          const variants = [
            original,
            { ...original, layers: [...original.layers].reverse() },
            {
              ...original,
              layers: original.layers.map((l) =>
                l.id === "front" ? { ...l, spatial: { ...l.spatial!, z: -1.5 } } : l,
              ),
            },
            {
              ...original,
              layers: original.layers.map((layer) =>
                layer.id === "front" ? { ...layer, opacity: 0 } : layer,
              ),
              motion: {
                version: 2 as const,
                initialized: true as const,
                mode: "motion" as const,
                duration: { value: 2, rate: 1 },
                frameRate: { numerator: 30, denominator: 1 },
                tracks: [],
              },
            },
            p3,
            {
              ...p3,
              layers: [
                input.group,
                ...p3.layers.map((layer) => ({ ...layer, parentId: input.group.id })),
              ],
            },
          ];
          for (const composition of variants) {
            console.info("scene-witness: rendering", forceWebGL, composition.layers[0]?.id);
            images.push(
              await session.withCanvasFrame(
                composition,
                input.project.assets,
                (canvas) => canvas.toDataURL("image/png"),
                { mediaMode: "exact" },
              ),
            );
          }
          outputs.push({ images, stats: session.stats() });
        } finally {
          await session.dispose();
        }
      }
      return { outputs, readbacks: window.__musartVideoReadbacks };
    },
    {
      project,
      group: createLayer("group", {
        id: "p3-group",
        x: 0,
        y: 0,
        width: 256,
        height: 256,
        spatial: createSpatialLayer("group"),
      }),
      renderUrl: `/@fs${resolve("packages/render/src/index.ts")}`,
    },
  );
  expect(result.readbacks).toMatchObject({ gpu: 0, canvas: 0, webgl: 0 });
  await mkdir("artifacts/scene-reflections", { recursive: true });
  const inspect = await browser.newPage();
  try {
    for (const [backend, output] of result.outputs.entries()) {
      const colors: number[][] = [];
      for (const [index, image] of output.images.entries()) {
        await writeFile(
          `artifacts/scene-reflections/depth-${backend}-${index}.png`,
          Buffer.from(image.split(",")[1]!, "base64"),
        );
        colors.push(
          await inspect.evaluate(async (src) => {
            const image = new Image();
            image.src = src;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext("2d")!;
            context.drawImage(image, 0, 0);
            return [...context.getImageData(128, 128, 1, 1).data];
          }, image),
        );
      }
      expect(colors[0]![0]).toBeGreaterThan(colors[0]![1]! + 40);
      expect(colors[1]).toEqual(colors[0]);
      expect(colors[2]![1]).toBeGreaterThan(colors[2]![0]! + 40);
      expect(colors[3]![1]).toBeGreaterThan(colors[3]![0]! + 40);
      expect(colors[5]).toEqual(colors[4]);
    }
  } finally {
    await inspect.close();
  }
  expect(errors).toEqual([]);
});

test("neighbours drive shared reflections, unchanged views reuse probes and preview gestures defer captures", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.route("**/scene-witness", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Scene reflections</title>",
    }),
  );
  await page.goto("/scene-witness");
  const project = createCornellBox().project;
  const result = await page.evaluate(
    async (input) => {
      const { createRenderSession } = (await import(
        input.renderUrl
      )) as typeof import("../../packages/render/src/index");
      const session = createRenderSession({ maxBytes: 128 * 1024 * 1024 });
      let idle = true,
        ready = 0;
      const listeners = new Set<() => void>();
      const activity = {
        read: () => idle,
        subscribe: (fn: () => void) => {
          listeners.add(fn);
          return () => {
            listeners.delete(fn);
          };
        },
        ready: () => {
          ready++;
        },
      };
      const capture = async (
        composition: (typeof input.project.pages)[number],
        preview = false,
      ) => {
        const image = await session.withCanvasFrame(
          composition,
          input.project.assets,
          (canvas) => canvas.toDataURL("image/png"),
          { scale: 256 / 1080, mediaMode: preview ? "preview" : "exact", backgroundGpu: activity },
        );
        return { image, stats: session.stats() };
      };
      try {
        const original = input.project.pages[0]!;
        const first = await capture(original),
          warm = await capture(original);
        const shadowless = await capture({
          ...original,
          layers: original.layers.map((layer) =>
            layer.id === "cornell-block"
              ? { ...layer, spatial: { ...layer.spatial!, castShadow: false } }
              : layer,
          ),
        });
        const orbit = await capture({
          ...original,
          spatial: { ...original.spatial!, camera: { ...original.spatial!.camera, yaw: 8 } },
        });
        const core = (await import(
          input.coreUrl
        )) as typeof import("../../packages/core/src/index");
        const program = core.compileMotion(input.project, { compositionId: original.id });
        await capture(
          core.applyMotionFrame(program, core.evaluateMotion(program, { value: 4, rate: 1 })),
        );
        const loopEnd = await capture(
          core.applyMotionFrame(
            program,
            core.evaluateMotion(program, { value: 8, rate: 1 }, { terminalPreview: true }),
          ),
        );
        const recolored = {
          ...original,
          layers: original.layers.map((layer) =>
            layer.id === "cornell-left" ? { ...layer, fill: "#224BFF" } : layer,
          ),
        };
        idle = false;
        const deferred = await capture(recolored, true);
        idle = true;
        for (const listener of listeners) listener();
        const updated = await capture(recolored, true);
        const selected = await capture(
          core.selectionComposition(original, ["cornell-sphere"], [], { centerInArtboard: true }),
        );
        const disabled = await capture({
          ...original,
          spatial: {
            ...original.spatial!,
            reflections: { mode: "environment", quality: "balanced" },
          },
        });
        await session.dispose();
        return {
          first,
          warm,
          orbit,
          deferred,
          updated,
          selected,
          loopEnd,
          shadowless,
          disabled,
          ready,
          listeners: listeners.size,
          readbacks: window.__musartVideoReadbacks,
        };
      } finally {
        await session.dispose();
      }
    },
    {
      project,
      renderUrl: `/@fs${resolve("packages/render/src/index.ts")}`,
      coreUrl: `/@fs${resolve("packages/core/src/index.ts")}`,
    },
  );
  expect(result.first.stats?.spatial?.reflections).toMatchObject({
    probes: 2,
    captures: 2,
    meshes: 9,
    omittedMeshes: 0,
  });
  expect(result.warm.stats?.spatial?.reflections?.captures).toBe(0);
  expect(result.orbit.stats?.spatial?.reflections?.captures).toBe(0);
  expect(result.deferred.stats?.spatial?.reflections).toMatchObject({
    captures: 0,
    deferred: true,
  });
  expect(result.updated.stats?.spatial?.reflections).toMatchObject({
    captures: 2,
    deferred: false,
  });
  expect(result.disabled.stats?.spatial?.reflections).toBeUndefined();
  expect(result.first.stats!.cacheBytes).toBeLessThan(128 * 1024 * 1024);
  expect(result.ready).toBe(1);
  expect(result.listeners).toBe(0);
  expect(result.readbacks).toMatchObject({ gpu: 0, canvas: 0, webgl: 0 });
  await mkdir("artifacts/scene-reflections", { recursive: true });
  for (const key of ["first", "updated", "disabled", "selected", "shadowless"] as const)
    await writeFile(
      `artifacts/scene-reflections/cornell-${key}.png`,
      Buffer.from(result[key].image.split(",")[1]!, "base64"),
    );
  const inspection = await browser.newPage();
  try {
    const closure = await inspection.evaluate(
      async (sources) => {
        const pixels = await Promise.all(
          sources.map(async (src) => {
            const image = new Image();
            image.src = src;
            await image.decode();
            const c = document.createElement("canvas");
            c.width = 256;
            c.height = 256;
            const ctx = c.getContext("2d")!;
            ctx.drawImage(image, 0, 0);
            return ctx.getImageData(0, 0, 256, 256).data;
          }),
        );
        let error = 0;
        for (let i = 0; i < pixels[0]!.length; i++)
          error += Math.abs(pixels[0]![i]! - pixels[1]![i]!);
        return error / pixels[0]!.length;
      },
      [result.first.image, result.loopEnd.image],
    );
    expect(closure).toBeLessThan(0.05);
    const centered = await inspection.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, 256, 256).data;
      let x = 0,
        y = 0,
        count = 0;
      for (let i = 0; i < data.length; i += 4)
        if (data[i + 3]! > 64) {
          x += (i / 4) % 256;
          y += Math.floor(i / 4 / 256);
          count++;
        }
      return { x: x / count, y: y / count, count };
    }, result.selected.image);
    expect(centered.count).toBeGreaterThan(1000);
    expect(Math.abs(centered.x - 127.5)).toBeLessThan(2);
    expect(Math.abs(centered.y - 127.5)).toBeLessThan(2);
    const changed = await inspection.evaluate(
      async (images) => {
        const pixels = await Promise.all(
          images.map(async (src) => {
            const image = new Image();
            image.src = src;
            await image.decode();
            const c = document.createElement("canvas");
            c.width = 256;
            c.height = 256;
            const ctx = c.getContext("2d")!;
            ctx.drawImage(image, 0, 0);
            return ctx.getImageData(145, 153, 90, 82).data;
          }),
        );
        let count = 0;
        for (let i = 0; i < pixels[0]!.length; i += 4)
          if (
            Math.abs(pixels[0]![i]! - pixels[1]![i]!) +
              Math.abs(pixels[0]![i + 2]! - pixels[1]![i + 2]!) >
            30
          )
            count++;
        return count;
      },
      [result.first.image, result.updated.image],
    );
    expect(changed, "wall color must change the sphere reflection").toBeGreaterThan(150);
  } finally {
    await inspection.close();
  }
  expect(errors).toEqual([]);
});

test("native grouped objects remain motionable in a decoded video export", async ({ page }) => {
  test.setTimeout(90000);
  await mkdir("artifacts/scene-reflections", { recursive: true });
  for (const [source, file] of [
    ["test/browser/support/spatial-motion-witness.ts", "motion-witness.js"],
    ["packages/render/src/spatial/geometry.worker.ts", "geometry-worker.js"],
  ])
    execFileSync(
      "bun",
      [
        "build",
        source!,
        "--target=browser",
        "--external=*?url",
        `--outfile=artifacts/scene-reflections/${file}`,
      ],
      { stdio: "pipe" },
    );
  await page.route("**/spatial-motion-witness.js", async (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: await readFile("artifacts/scene-reflections/motion-witness.js", "utf8"),
    }),
  );
  await page.route("**/geometry.worker.ts", async (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: await readFile("artifacts/scene-reflections/geometry-worker.js", "utf8"),
    }),
  );
  await page.route("**/assets/profiles/CRPC6-perceptual-rgb8.bin?url", (route) =>
    route.fulfill({ contentType: "text/javascript", body: 'export default "/spatial-proof.bin";' }),
  );
  await page.route("**/spatial-font-url.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: 'export default "/spatial-font.wasm";' }),
  );
  await page.route("**/scene-witness", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><title>Native group Motion</title><script type="importmap">{"imports":{"harfbuzzjs/hb.wasm?url":"/spatial-font-url.js"}}</script>',
    }),
  );
  await page.goto("/scene-witness");
  const scene = createSpatialScene();
  scene.camera.yaw = 0;
  scene.camera.pitch = 0;
  scene.reflections!.mode = "environment";
  const project = createProject({
    pages: [
      createPage({
        id: "group-motion",
        width: 128,
        height: 128,
        spatial: scene,
        layers: [
          createLayer("group", {
            id: "rig",
            x: 0,
            y: 0,
            width: 128,
            height: 128,
            spatial: createSpatialLayer("group"),
          }),
          createLayer("rectangle", {
            id: "left",
            parentId: "rig",
            x: 0,
            y: 0,
            width: 128,
            height: 128,
            fill: "#8757FF",
            spatial: {
              ...createSpatialLayer("box"),
              x: -0.6,
              scaleX: 0.4,
              scaleY: 0.7,
              scaleZ: 0.4,
            },
          }),
          createLayer("rectangle", {
            id: "right",
            parentId: "rig",
            x: 0,
            y: 0,
            width: 128,
            height: 128,
            fill: "#20CF66",
            spatial: {
              ...createSpatialLayer("sphere"),
              x: 0.6,
              scaleX: 0.4,
              scaleY: 0.4,
              scaleZ: 0.4,
            },
          }),
        ],
      }),
    ],
  });
  const result = await page.evaluate(
    async (input) => {
      const witness = (await import(
        input.url
      )) as typeof import("./support/spatial-motion-witness");
      const encoded = await witness.renderSpatialMotion(input.project);
      return { encoded, decoded: await witness.inspectSpatialMotion(encoded.encoded) };
    },
    { project, url: "/spatial-motion-witness.js" },
  );
  expect(result.encoded.unchanged).toBe(true);
  expect(result.encoded.frames).toBe(6);
  expect(result.decoded).toMatchObject({ width: 128, height: 128, frames: 6 });
  expect(result.decoded.colored).toBeGreaterThan(300);
  expect(result.decoded.changed).toBeGreaterThan(300);
  await mkdir("artifacts/scene-reflections", { recursive: true });
  await writeFile(
    "artifacts/scene-reflections/group-motion.mp4",
    Buffer.from(result.encoded.encoded.split(",")[1]!, "base64"),
  );
});
