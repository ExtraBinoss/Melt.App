import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { installReadbackProbe } from "./support/readback-probe";
let bundle: string, worker: string;
test.beforeAll(async () => {
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/time-warp-scan-witness.ts",
      "--target=browser",
      "--external=*?url",
      "--outfile=artifacts/time-warp-scan/witness.js",
    ],
    { stdio: "pipe" },
  );
  execFileSync(
    "bun",
    [
      "build",
      "packages/render/src/spatial/geometry.worker.ts",
      "--target=browser",
      "--outfile=artifacts/time-warp-scan/geometry-worker.js",
    ],
    { stdio: "pipe" },
  );
  worker = await readFile("artifacts/time-warp-scan/geometry-worker.js", "utf8");
  bundle = await readFile("artifacts/time-warp-scan/witness.js", "utf8");
});
for (const forceWebGL of [false, true])
  test(`time warp scan: native ${forceWebGL ? "WebGL" : "WebGPU"} video and still image`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await installReadbackProbe(page);
    await page.context().route("**/scan-renderer.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><script type="importmap">{"imports":{"harfbuzzjs/hb.wasm?url":"/unused-font.js"}}</script>',
      }),
    );
    await page.context().route("**/unused-font.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: 'export default "/unused-font.wasm";',
      }),
    );
    await page.context().route("**/assets/profiles/CRPC6-perceptual-rgb8.bin?url", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: 'export default "/unused-proof.bin";',
      }),
    );
    await page
      .context()
      .route("**/scan-witness.js", (route) =>
        route.fulfill({ contentType: "text/javascript", body: bundle }),
      );
    await page
      .context()
      .route("**/geometry.worker.ts", (route) =>
        route.fulfill({ contentType: "text/javascript", body: worker }),
      );
    await page.goto("/scan-renderer.html");
    const result = await page.evaluate(async (force) => {
      const path = "/scan-witness.js";
      return (await import(/* @vite-ignore */ path)).runTimeWarpScan(force);
    }, forceWebGL);
    const counts = await page.evaluate(() => window.__musartVideoReadbacks);
    await mkdir("artifacts/time-warp-scan/native", { recursive: true });
    await writeFile(
      `artifacts/time-warp-scan/native/${forceWebGL ? "webgl" : "webgpu"}.json`,
      JSON.stringify({ result, counts }, null, 2),
    );
    const inspector = await page.context().newPage();
    try {
      await inspector.goto("/scan-renderer.html");
      const decoded = await inspector.evaluate(async (encoded) => {
        const path = "/scan-witness.js";
        return (await import(/* @vite-ignore */ path)).inspectTimeWarpExport(encoded);
      }, result.exportVideo.encoded);
      expect(decoded).toHaveLength(4);
      expect(result.exportVideo.frames).toBe(4);
      expect(decoded[3].top[0]).toBeGreaterThan(140);
      expect(decoded[3].bottom[2]).toBeGreaterThan(140);
      const pixels = await inspector.evaluate(
        async (images: Record<string, string>) => {
          const result: Record<string, number[]> = {};
          for (const [key, data] of Object.entries(images)) {
            const image = new Image();
            image.src = data;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(image, 0, 0);
            result[key] = Array.from(ctx.getImageData(0, 0, image.width, image.height).data);
          }
          return result;
        },
        {
          ...Object.fromEntries(
            Object.entries(result).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string",
            ),
          ),
          ...result.directions,
          ...result.imageVariants,
        },
      );
      const maxDifference = (a: string, b: string) =>
        Math.max(...pixels[a]!.map((value, index) => Math.abs(value - pixels[b]![index]!)));
      expect(maxDifference("end", "seek")).toBeLessThanOrEqual(1);
      expect(maxDifference("middle", "reverse")).toBeLessThanOrEqual(1);
      expect(maxDifference("image", "zero")).toBeLessThanOrEqual(1);
      expect(maxDifference("image", "warped")).toBeGreaterThan(50);
      const rgb = (name: string, y: number) =>
        pixels[name]!.slice((y * 64 + 32) * 4, (y * 64 + 32) * 4 + 3);
      // The top remains red, the middle captures green, the bottom captures blue.
      expect(rgb("end", 8)[0]).toBeGreaterThan(150);
      expect(rgb("end", 32)[1]).toBeGreaterThan(150);
      expect(rgb("end", 60)[2]).toBeGreaterThan(150);
      expect(rgb("middle", 8)).toEqual(rgb("end", 8));
      const at = (name: string, x: number, y: number) =>
        pixels[name]!.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 3);
      expect(at("up", 32, 60)[0]).toBeGreaterThan(150);
      expect(at("up", 32, 4)[2]).toBeGreaterThan(150);
      expect(at("right", 4, 32)[0]).toBeGreaterThan(150);
      expect(at("right", 60, 32)[2]).toBeGreaterThan(150);
      expect(at("left", 60, 32)[0]).toBeGreaterThan(150);
      expect(at("left", 4, 32)[2]).toBeGreaterThan(150);
      expect(at("manual", 32, 4)[0]).toBeGreaterThan(150);
      expect(at("manual", 32, 40)[2]).toBeGreaterThan(150);
      expect(maxDifference("image", "clamp")).toBeGreaterThan(50);
      expect(pixels.transparent!.some((value, index) => index % 4 === 3 && value === 0)).toBe(true);
      for (const name of ["spatial", "spatialMotion"])
        expect(pixels[name]!.some((value, index) => index % 4 === 3 && value > 10)).toBe(true);
      expect(pixels.hoverPreview!.some((value, index) => index % 4 === 3 && value > 10)).toBe(true);
      expect(result.cancelled).toBe(true);
      expect(result.load.cacheBytes).toBeLessThanOrEqual(result.load.maxBytes);
      expect(result.load.temporal.captures).toBeGreaterThan(8);
      expect(result.warmStats.temporal.captures).toBe(8);
      expect(result.warmStats.cacheBytes).toBeLessThanOrEqual(result.warmStats.maxBytes);
      expect(counts).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
      await mkdir("artifacts/time-warp-scan/native", { recursive: true });
      await writeFile(
        `artifacts/time-warp-scan/native/${forceWebGL ? "webgl" : "webgpu"}.json`,
        JSON.stringify({ result, counts }, null, 2),
      );
    } finally {
      await inspector.close();
    }
  });
