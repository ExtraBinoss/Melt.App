import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { installReadbackProbe } from "./support/readback-probe";
import type { captureEffectViewport } from "./support/effect-viewport";

let bundle: string;
test.beforeAll(async () => {
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/effect-viewport.ts",
      "--target=browser",
      "--external=*?url",
      "--outfile=artifacts/effect-viewport/witness.js",
    ],
    { stdio: "pipe" },
  );
  bundle = await readFile("artifacts/effect-viewport/witness.js", "utf8");
});

for (const forceWebGL of [false, true])
  test(`Spatial effects keep authored fields across pan/zoom transport windows (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
    context,
  }) => {
    test.setTimeout(240000);
    await installReadbackProbe(page);
    await page.route("**/effect-viewport-witness", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><script type="importmap">{"imports":{"harfbuzzjs/hb.wasm?url":"/effect-viewport-unused.js"}}</script>',
      }),
    );
    await page.route("**/*?url", (route) =>
      route.fulfill({ contentType: "text/javascript", body: 'export default "/unused.bin";' }),
    );
    await page.route("**/effect-viewport-unused.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: 'export default "/unused.wasm";' }),
    );
    await page.route("**/effect-viewport-witness.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: bundle }),
    );
    await page.goto("/effect-viewport-witness");
    const result: Awaited<ReturnType<typeof captureEffectViewport>> = await page.evaluate(
      async ({ force, names }) => {
        const path = "/effect-viewport-witness.js";
        return (await import(/* @vite-ignore */ path)).captureEffectViewport(force, names);
      },
      { force: forceWebGL, names: process.env.EFFECT_VIEWPORT_NAMES?.split(",") },
    );
    expect(result.stats?.backend).toBe(forceWebGL ? "webgl" : "webgpu");
    expect(result.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
    const inspector = await context.newPage();
    try {
      const metrics = await inspector.evaluate(async (frames) => {
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
            width: image.width,
            pixels: ctx.getImageData(0, 0, image.width, image.height).data,
          };
        };
        const rows = [];
        for (const { reference, candidate, ...frame } of frames) {
          const a = await decode(reference),
            b = await decode(candidate),
            { viewport, scale } = frame;
          let difference = 0,
            maximum = 0,
            pixels = 0;
          // Compare a fixed authored interior so nonlocal effects retain source pixels
          // on both transports. Shatter separately checks complete borders and crops.
          for (let y = 32; y < 96; y += 1 / scale)
            for (let x = 32; x < 96; x += 1 / scale) {
              const ai = (y * scale * a.width + x * scale) * 4,
                bi = ((y - viewport.y) * scale * b.width + (x - viewport.x) * scale) * 4;
              for (let channel = 0; channel < 4; channel++) {
                const aa = channel < 3 ? a.pixels[ai + 3]! / 255 : 1,
                  ba = channel < 3 ? b.pixels[bi + 3]! / 255 : 1,
                  delta = Math.abs(a.pixels[ai + channel]! * aa - b.pixels[bi + channel]! * ba);
                difference += delta;
                maximum = Math.max(maximum, delta);
              }
              pixels++;
            }
          rows.push({ ...frame, pixels, mean: difference / (pixels * 4), maximum });
        }
        return rows;
      }, result.frames);
      await mkdir("artifacts/effect-viewport", { recursive: true });
      for (const frame of result.frames)
        if (["receipt", "gradient-blocks", "gradient-folds"].includes(frame.name))
          for (const kind of ["reference", "candidate"] as const)
            await writeFile(
              `artifacts/effect-viewport/${forceWebGL ? "webgl" : "webgpu"}-${frame.name}-${frame.owner}-${kind}.png`,
              Buffer.from(frame[kind].split(",")[1]!, "base64"),
            );
      await writeFile(
        `artifacts/effect-viewport/${forceWebGL ? "webgl" : "webgpu"}.json`,
        JSON.stringify({ metrics, stats: result.stats, reads: result.reads }, null, 2),
      );
      for (const row of metrics) {
        expect(row.mean, JSON.stringify(row)).toBeLessThanOrEqual(0.05);
        expect(row.maximum, JSON.stringify(row)).toBeLessThanOrEqual(2);
      }
    } finally {
      await inspector.close();
    }
  });
