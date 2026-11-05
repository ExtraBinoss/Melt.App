import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { installReadbackProbe } from "./support/readback-probe";
let bundle: string;
test.beforeAll(async () => {
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/background-continuity.ts",
      "--target=browser",
      "--external=*?url",
      "--outfile=artifacts/background-continuity/witness.js",
    ],
    { stdio: "pipe" },
  );
  bundle = await readFile("artifacts/background-continuity/witness.js", "utf8");
});
for (const forceWebGL of [false, true])
  test(`resized legacy background fills canonical and expanded windows, and Transparent clears its old underlay (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
    context,
  }) => {
    await installReadbackProbe(page);
    await page.route("**/continuity-witness", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><script type="importmap">{"imports":{"harfbuzzjs/hb.wasm?url":"/continuity-unused.js"}}</script>',
      }),
    );
    await page.route("**/*?url", (route) =>
      route.fulfill({ contentType: "text/javascript", body: 'export default "/unused.bin";' }),
    );
    await page.route("**/continuity-unused.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: 'export default "/unused.wasm";' }),
    );
    await page.route("**/continuity-witness.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: bundle }),
    );
    await page.goto("/continuity-witness");
    const result = await page.evaluate(async (force) => {
      const path = "/continuity-witness.js";
      return (await import(/* @vite-ignore */ path)).captureBackgroundContinuity(force);
    }, forceWebGL);
    expect(result.stats?.backend).toBe(forceWebGL ? "webgl" : "webgpu");
    expect(result.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
    const inspector = await context.newPage();
    try {
      const decoded = await inspector.evaluate(async (results) => {
        const output = [];
        for (const frame of results) {
          const colors: Record<string, number[][]> = {};
          for (const [key, value] of Object.entries(frame)) {
            if (typeof value !== "string") continue;
            const image = new Image();
            image.src = value;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(image, 0, 0);
            colors[key] = [0, Math.floor(image.width / 2), image.width - 1].map((x) =>
              Array.from(ctx.getImageData(x, Math.floor(image.height / 2), 1, 1).data),
            );
          }
          output.push({ expanded: frame.expanded, colors });
        }
        return output;
      }, result.results);
      for (const { colors } of decoded) {
        for (const key of ["solid", "resized", "restored"])
          for (const pixel of colors[key]!) expect(pixel).toEqual([36, 39, 44, 255]);
        for (const key of ["transparent", "effectsTransparent"])
          for (const pixel of colors[key]!) expect(pixel[3]).toBe(0);
        for (const pixel of colors.effectful!)
          if (pixel[3]! > 0)
            expect(Math.max(...pixel.slice(0, 3)) - Math.min(...pixel.slice(0, 3))).toBeLessThan(
              12,
            );
        for (const pixel of colors.gradient!) {
          expect(pixel[3]).toBe(255);
          expect(Math.max(...pixel.slice(0, 3)) - Math.min(...pixel.slice(0, 3))).toBeLessThan(10);
        }
        expect(colors.ordinary![0]![2]).toBeGreaterThan(colors.ordinary![0]![1]! + 20);
      }
      for (const frame of result.results) expect(frame.restored).toBe(frame.solid);
      await mkdir("artifacts/background-continuity", { recursive: true });
      await writeFile(
        `artifacts/background-continuity/${forceWebGL ? "webgl" : "webgpu"}.json`,
        JSON.stringify({ decoded, stats: result.stats }, null, 2),
      );
    } finally {
      await inspector.close();
    }
  });
