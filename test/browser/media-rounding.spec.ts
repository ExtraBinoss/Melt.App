import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { installReadbackProbe } from "./support/readback-probe";
let bundle: string, worker: string;
test.beforeAll(async () => {
  for (const [source, name] of [
    ["test/browser/support/media-rounding-witness.ts", "witness.js"],
    ["packages/render/src/spatial/geometry.worker.ts", "worker.js"],
  ])
    execFileSync(
      "bun",
      [
        "build",
        source!,
        "--target=browser",
        "--external=*?url",
        `--outfile=artifacts/media-rounding/${name}`,
      ],
      { stdio: "pipe" },
    );
  bundle = await readFile("artifacts/media-rounding/witness.js", "utf8");
  worker = await readFile("artifacts/media-rounding/worker.js", "utf8");
});
for (const forceWebGL of [false, true])
  test(`rounded media sources feed effects and native Motion/export on ${forceWebGL ? "WebGL image/video" : "WebGPU image"}`, async ({
    page,
  }) => {
    await installReadbackProbe(page);
    await page.route("**/rounding-renderer.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><script type="importmap">{"imports":{"harfbuzzjs/hb.wasm?url":"/rounding-font.js"}}</script>',
      }),
    );
    await page.route("**/rounding-font.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: 'export default "/unused.wasm";' }),
    );
    await page.route("**/assets/profiles/CRPC6-perceptual-rgb8.bin?url", (route) =>
      route.fulfill({ contentType: "text/javascript", body: 'export default "/unused.bin";' }),
    );
    await page.route("**/rounding-witness.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: bundle }),
    );
    await page.route("**/geometry.worker.ts", (route) =>
      route.fulfill({ contentType: "text/javascript", body: worker }),
    );
    await page.goto("/rounding-renderer.html");
    const output = await page.evaluate(async (force) => {
      const path = "/rounding-witness.js";
      return (await import(/* @vite-ignore */ path)).runMediaRounding(force);
    }, forceWebGL);
    const results = output.results;
    if (output.workload) {
      expect(output.workload.uploads).toBe(1);
      expect(output.workload.cacheBytes).toBeLessThanOrEqual(output.workload.maxBytes);
    }
    const counts = await page.evaluate(() => window.__musartVideoReadbacks);
    expect(counts).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
    const inspector = await page.context().newPage(),
      reports = [];
    try {
      for (const result of results) {
        const report = await inspector.evaluate(async (result) => {
          const decode = async (url: string) => {
            const image = new Image();
            image.src = url;
            await image.decode();
            const c = document.createElement("canvas");
            c.width = image.width;
            c.height = image.height;
            const ctx = c.getContext("2d")!;
            ctx.drawImage(image, 0, 0);
            return { data: ctx.getImageData(0, 0, c.width, c.height).data, width: c.width };
          };
          const square = await decode(result.square),
            rounded = await decode(result.rounded),
            bevel = await decode(result.bevel),
            squareShadow = await decode(result.squareShadow),
            roundedShadow = await decode(result.roundedShadow),
            large = await decode(result.large),
            restored = await decode(result.restored),
            animated = await decode(result.animated);
          const alpha = (image: typeof square, x: number, y: number) =>
            image.data[(y * image.width + x) * 4 + 3]!;
          let alphaError = 0,
            zeroError = 0,
            bevelChange = 0;
          for (let i = 0; i < square.data.length; i++) {
            zeroError = Math.max(zeroError, Math.abs(square.data[i]! - restored.data[i]!));
            if (i % 4 === 3)
              alphaError = Math.max(alphaError, Math.abs(rounded.data[i]! - bevel.data[i]!));
            else bevelChange += Math.abs(rounded.data[i]! - bevel.data[i]!);
          }
          return {
            squareCorner: alpha(square, 32, 32),
            roundedCorner: alpha(rounded, 32, 32),
            center: alpha(rounded, 64, 64),
            alphaError,
            zeroError,
            bevelChange,
            squareShadowCorner: alpha(squareShadow, 29, 32),
            roundedShadowCorner: alpha(roundedShadow, 29, 32),
            roundedShadowSide: alpha(roundedShadow, 29, 64),
            largeCorner: alpha(large, 64, 64),
            largeCenter: alpha(large, 128, 128),
            animatedCorner: alpha(animated, 32, 32),
            animatedCenter: alpha(animated, 64, 64),
          };
        }, result);
        expect(report.squareCorner).toBe(255);
        expect(report.roundedCorner).toBe(0);
        expect(report.center).toBe(255);
        expect(report.alphaError).toBeLessThanOrEqual(1);
        expect(report.bevelChange).toBeGreaterThan(100);
        expect(report.squareShadowCorner - report.roundedShadowCorner).toBeGreaterThan(10);
        expect(report.roundedShadowSide).toBeGreaterThan(5);
        expect(report.zeroError).toBeLessThanOrEqual(1);
        expect(report.largeCorner).toBe(0);
        expect(report.largeCenter).toBe(255);
        expect(report.animatedCorner).toBe(0);
        expect(report.animatedCenter).toBe(255);
        reports.push({ kind: result.kind, ...report });
        await mkdir("artifacts/media-rounding/native", { recursive: true });
        for (const key of ["rounded", "bevel", "roundedShadow"] as const)
          await writeFile(
            `artifacts/media-rounding/native/${forceWebGL ? "webgl" : "webgpu"}-${result.kind}-${key}.png`,
            Buffer.from(result[key].split(",")[1], "base64"),
          );
      }
    } finally {
      await inspector.close();
    }
    await writeFile(
      `artifacts/media-rounding/native/${forceWebGL ? "webgl" : "webgpu"}.json`,
      JSON.stringify({ reports, counts, workload: output.workload }, null, 2),
    );
  });
