import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { installReadbackProbe } from "./support/readback-probe";
let bundle: string, worker: string;
test.beforeAll(async () => {
  for (const [source, name] of [
    ["test/browser/support/background-gradients-witness.ts", "witness.js"],
    ["packages/render/src/spatial/geometry.worker.ts", "worker.js"],
  ])
    execFileSync(
      "bun",
      [
        "build",
        source!,
        "--target=browser",
        "--external=*?url",
        `--outfile=artifacts/background-gradients/${name}`,
      ],
      { stdio: "pipe" },
    );
  bundle = await readFile("artifacts/background-gradients/witness.js", "utf8");
  worker = await readFile("artifacts/background-gradients/worker.js", "utf8");
});
for (const forceWebGL of [false, true])
  test(`native gradient paint, alpha and cache invalidation on ${forceWebGL ? "WebGL" : "WebGPU"}`, async ({
    page,
  }) => {
    await installReadbackProbe(page);
    await page.route("**/gradient-renderer.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><script type="importmap">{"imports":{"harfbuzzjs/hb.wasm?url":"/gradient-font.js"}}</script>',
      }),
    );
    await page.route("**/gradient-font.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: 'export default "/unused.wasm";' }),
    );
    await page.route("**/assets/profiles/CRPC6-perceptual-rgb8.bin?url", (route) =>
      route.fulfill({ contentType: "text/javascript", body: 'export default "/unused.bin";' }),
    );
    await page.route("**/gradient-witness.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: bundle }),
    );
    await page.route("**/geometry.worker.ts", (route) =>
      route.fulfill({ contentType: "text/javascript", body: worker }),
    );
    await page.goto("/gradient-renderer.html");
    const result = await page.evaluate(async (force) => {
      const path = "/gradient-witness.js";
      return (await import(/* @vite-ignore */ path)).runBackgroundGradients(force);
    }, forceWebGL);
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
    const inspector = await page.context().newPage();
    try {
      const decoded = await inspector.evaluate(async (result) => {
        const output: Record<
          string,
          { left: number[]; right: number[]; top: number[]; bottom: number[]; center: number[] }
        > = {};
        for (const [name, url] of Object.entries(result)) {
          if (typeof url !== "string") continue;
          const image = new Image();
          image.src = url;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(image, 0, 0);
          const pixel = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data);
          output[name] = {
            left: pixel(0, 16),
            right: pixel(63, 16),
            top: pixel(32, 0),
            bottom: pixel(32, 31),
            center: pixel(32, 16),
          };
        }
        return output;
      }, result);
      expect(decoded.horizontal!.left[0]).toBeGreaterThan(245);
      expect(decoded.horizontal!.right[2]).toBeGreaterThan(245);
      expect(decoded.vertical!.top[0]).toBeGreaterThan(240);
      expect(decoded.vertical!.bottom[2]).toBeGreaterThan(240);
      expect(decoded.radial!.center[0]).toBeGreaterThan(230);
      expect(decoded.radial!.left[2]).toBeGreaterThan(245);
      expect(decoded.alpha!.center[3]).toBeCloseTo(128, 0);
      expect(decoded.alpha!.center[0]).toBe(255);
      expect(decoded.solid!.center).toEqual([0, 255, 0, 255]);
      expect(result.restored).toBe(result.horizontal);
      await mkdir("artifacts/background-gradients/native", { recursive: true });
      await writeFile(
        `artifacts/background-gradients/native/${forceWebGL ? "webgl" : "webgpu"}.json`,
        JSON.stringify({ decoded, stats: result.stats }, null, 2),
      );
      await writeFile(
        `artifacts/background-gradients/native/${forceWebGL ? "webgl" : "webgpu"}.png`,
        Buffer.from(result.horizontal.split(",")[1]!, "base64"),
      );
    } finally {
      await inspector.close();
    }
  });
