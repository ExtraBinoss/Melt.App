/** Bake the searchable effect catalog once through the production GPU graph. */
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type * as Core from "../../packages/core/src/index";
import type * as Render from "../../packages/render/src/index";
import { installReadbackProbe } from "../../test/browser/support/readback-probe";

const base = process.env.EFFECT_PREVIEW_URL ?? "http://127.0.0.1:6100";
const source = await readFile("apps/web/public/benchmark/06-boathouse-1.jpg");
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/opt/google/chrome/chrome",
  args: [
    "--no-sandbox",
    "--enable-unsafe-webgpu",
    "--enable-unsafe-swiftshader",
    "--use-angle=vulkan",
    "--enable-features=Vulkan",
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 1000 },
  });
  await installReadbackProbe(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__effect-catalog-atlas", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Melt effect atlas</title>",
    }),
  );
  await page.goto(`${base}/__effect-catalog-atlas`);
  const result = await page.evaluate(
    async (input) => {
      const [core, renderer] = await Promise.all([
        import(input.core) as Promise<typeof Core>,
        import(input.renderer) as Promise<typeof Render>,
      ]);
      const cellWidth = 240,
        cellHeight = 180,
        columns = 8;
      const entries = Object.values(core.EFFECT_CATALOG).filter(
        (entry) => !entry.retired && !entry.source,
      );
      const atlas = document.createElement("canvas");
      atlas.width = columns * cellWidth;
      atlas.height = Math.ceil(entries.length / columns) * cellHeight;
      const context = atlas.getContext("2d")!;
      const session = renderer.createRenderSession({
        maxBytes: 64 * 1024 * 1024,
      });
      const frames: {
        type: Core.EffectType;
        stats: ReturnType<typeof session.stats>;
      }[] = [];
      const patches: Partial<Record<Core.EffectType, Partial<Core.Effect>>> = {
        terminal: {
          time: 1.2,
          settings: { progress: 0.68, columns: 16, rows: 8 },
        },
        liquify: {
          liquify: [
            {
              x: 0.5,
              y: 0.5,
              dx: 0.18,
              dy: -0.08,
              radius: 0.42,
              strength: 0.9,
              hardness: 0.2,
              mode: "twirl-cw",
            },
          ],
        },
        "window-trails": {
          time: 2.8,
          settings: {
            count: 6,
            width: 70,
            height: 50,
            titleHeight: 7,
            border: 1,
            entranceDelay: 0,
            radiusX: 0.27,
            radiusY: 0.23,
          },
        },
        displace: { inputs: { map: "catalog-photo" } },
        transition: { settings: { style: "diagonal-wipe", progress: 0.58 } },
        feather: { scale: 12 },
        blur: { scale: 4 },
        shadow: {
          settings: {
            offsetX: 10,
            offsetY: 9,
            radius: 6,
            shadowColor: "#000000",
          },
        },
        brightness: { amount: 0.65 },
        contrast: { amount: 0.7 },
        saturation: { amount: 0.8 },
        hue: { amount: 0.72 },
        exposure: { amount: 0.65 },
        vibrance: { amount: 0.8 },
        temperature: { amount: 0.8 },
        tint: { amount: 0.75 },
        gamma: { amount: 0.7 },
      };
      const assets: Record<string, Core.Asset> = {
        "catalog-photo": {
          id: "catalog-photo",
          name: "Boathouse — Luca Bravo",
          mime: "image/jpeg",
          width: 1280,
          height: 960,
          dataUrl: input.photo,
        },
      };
      try {
        for (const [index, entry] of entries.entries()) {
          const effect = core.createEffect(entry.type, {
            ...patches[entry.type],
            id: `preview-${entry.type}`,
          });
          const composition = core.createPage({
            id: "catalog-page",
            width: cellWidth,
            height: cellHeight,
            background: "#17191f",
            layers: [
              core.createLayer("group", {
                id: "card",
                x: 20,
                y: 16,
                width: 200,
                height: 148,
                effects: [effect],
              }),
              core.createLayer("image", {
                id: "photo",
                parentId: "card",
                x: 0,
                y: 0,
                width: 200,
                height: 148,
                assetId: "catalog-photo",
                radius: 6,
              }),
              core.createLayer("text", {
                id: "letter",
                parentId: "card",
                x: 12,
                y: 10,
                width: 120,
                height: 92,
                text: "M",
                fontFamily: "sans-serif",
                fontSize: 84,
                fontWeight: 800,
                fill: "#ffffff",
              }),
              core.createLayer("ellipse", {
                id: "disc",
                parentId: "card",
                x: 138,
                y: 94,
                width: 40,
                height: 40,
                fill: "#ff985f",
              }),
            ],
          });
          await session.withCanvasFrame(composition, assets, (canvas) => {
            context.drawImage(
              canvas,
              (index % columns) * cellWidth,
              Math.floor(index / columns) * cellHeight,
            );
          });
          frames.push({ type: entry.type, stats: session.stats() });
        }
        return {
          image: atlas.toDataURL("image/webp", 0.92),
          entries: entries.map(({ type }) => type),
          columns,
          cellWidth,
          cellHeight,
          width: atlas.width,
          height: atlas.height,
          frames,
          reads: window.__musartVideoReadbacks,
        };
      } finally {
        await session.dispose();
      }
    },
    {
      core: `/@fs${resolve("packages/core/src/index.ts")}`,
      renderer: `/@fs${resolve("packages/render/src/index.ts")}`,
      photo: `data:image/jpeg;base64,${source.toString("base64")}`,
    },
  );
  if (errors.length) throw Error(`Effect atlas errors: ${errors.join("; ")}`);
  if (
    result.reads &&
    [result.reads.gpu, result.reads.webgl, result.reads.canvas, result.reads.videoFrame].some(
      (count) => count !== 0,
    )
  )
    throw Error(`Production readback detected: ${JSON.stringify(result.reads)}`);
  const { image, frames, reads, ...metadata } = result;
  await mkdir("apps/web/public/effects", { recursive: true });
  await writeFile(
    "apps/web/public/effects/catalog.webp",
    Buffer.from(image.split(",")[1]!, "base64"),
  );
  await writeFile(
    "apps/web/src/components/layers/catalog/effect-atlas.json",
    JSON.stringify({ version: 1, file: "catalog.webp", ...metadata }, null, 2) + "\n",
  );
  await mkdir("artifacts/effect-catalog", { recursive: true });
  await writeFile(
    "artifacts/effect-catalog/atlas-report.json",
    JSON.stringify({ frames, reads, errors }, null, 2),
  );
  console.log(
    `Rendered ${metadata.entries.length} native effect previews; production readbacks: ${JSON.stringify(reads)}`,
  );
} finally {
  await browser.close();
}
