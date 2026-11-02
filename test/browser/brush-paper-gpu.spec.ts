import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import type { brushPaperWitness } from "./support/brush-paper-witness";
let bundle: string;
test.beforeAll(async () => {
  await mkdir("artifacts/brush-paper", { recursive: true });
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/brush-paper-witness.ts",
      "--target=browser",
      "--external=*?url",
      "--outfile=artifacts/brush-paper/witness.js",
    ],
    { stdio: "pipe" },
  );
  bundle = await readFile("artifacts/brush-paper/witness.js", "utf8");
});
for (const forceWebGL of [false, true])
  test(`round screens, paper and brush GPU pixels and fifty-image bounds (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" ||
        (message.type() === "warning" && message.text().includes("THREE.TSL"))
      )
        errors.push(message.text());
    });
    await installReadbackProbe(page);
    await page.route("**/brush-paper.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><script type="importmap">{"imports":{"harfbuzzjs/hb.wasm?url":"/unused-font.js"}}</script>',
      }),
    );
    await page.route("**/unused-font.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: 'export default "/unused.wasm";' }),
    );
    await page.route("**/brush-paper.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: bundle }),
    );
    await page.goto("/brush-paper.html");
    await page.addScriptTag({
      type: "module",
      content:
        'import { brushPaperWitness } from "/brush-paper.js"; window.brushPaperWitness = brushPaperWitness;',
    });
    await page.waitForFunction(() => "brushPaperWitness" in window);
    const result = await page.evaluate(async (forceWebGL) => {
      const run = Reflect.get(window, "brushPaperWitness") as typeof brushPaperWitness;
      return run(forceWebGL);
    }, forceWebGL);
    expect(result.backend).toBe(forceWebGL ? "webgl" : "webgpu");
    const inspection = await context.newPage();
    try {
      const stats = await inspection.evaluate(async (data) => {
        const decode = async (url: string) => {
          const image = new Image();
          image.src = url;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(image, 0, 0);
          return ctx.getImageData(0, 0, image.width, image.height).data;
        };
        const original = await decode(data.baseline),
          output = [];
        for (const variant of data.variants) {
          const pixels = await decode(variant.png);
          let error = 0,
            colored = 0,
            alphaIncreases = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            if (
              pixels[i + 3]! > 0 &&
              Math.max(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!) -
                Math.min(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!) >
                25
            )
              colored++;
            if (pixels[i + 3]! > original[i + 3]!) alphaIncreases++;
            for (let c = 0; c < 4; c++) error += Math.abs(pixels[i + c]! - original[i + c]!);
          }
          output.push({
            name: variant.name,
            error,
            colored,
            alphaIncreases,
            cornerAlpha: pixels[3],
          });
        }
        const identityErrors = [];
        for (const png of data.identities) {
          const pixels = await decode(png);
          identityErrors.push(
            pixels.reduce((m, v, i) => Math.max(m, Math.abs(v - original[i]!)), 0),
          );
        }
        return { output, identityErrors };
      }, result);
      expect(stats.identityErrors.every((e) => e <= 1)).toBe(true);
      for (const item of stats.output) expect(item.error, item.name).toBeGreaterThan(50);
      for (const name of ["round-mosaic", "circle-grid", "color-screen"])
        expect(stats.output.find((v) => v.name === name)!.colored).toBeGreaterThan(50);
      expect(stats.output.find((v) => v.name === "torn-paper")!.cornerAlpha).toBe(0);
      expect(stats.output.find((v) => v.name === "restore")!.error).toBeLessThan(
        stats.output.find((v) => v.name === "push")!.error,
      );
      expect(result.repeat).toBe(result.repeatAgain);
      expect(result.loaded.materials).toBe(result.warm.materials);
      expect(result.loaded.targets).toBeLessThanOrEqual(result.warm.targets);
      expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
        gpu: 0,
        webgl: 0,
        canvas: 0,
        videoFrame: 0,
      });
      expect(errors).toEqual([]);
      await writeFile(
        `artifacts/brush-paper/${result.backend}.json`,
        JSON.stringify({ stats, warm: result.warm, loaded: result.loaded }, null, 2),
      );
    } finally {
      await inspection.close();
    }
  });
