import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installReadbackProbe } from "./support/readback-probe";

test("native directional, point and spot light colors/intensities update between renders in one JS task", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await installReadbackProbe(page);
  await page.route("**/light-samples-witness", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Exact native light samples</title>",
    }),
  );
  await page.goto("/light-samples-witness");
  const result = await page.evaluate(
    async ({ witnessUrl }) => {
      const { captureLightSamples } = (await import(
        witnessUrl
      )) as typeof import("./support/spatial-light-samples-witness");
      const outputs = [];
      for (const forceWebGL of [false, true]) outputs.push(await captureLightSamples(forceWebGL));
      return { outputs, readbacks: window.__musartVideoReadbacks };
    },
    { witnessUrl: `/@fs${resolve("test/browser/support/spatial-light-samples-witness.ts")}` },
  );
  const inspector = await browser.newPage();
  try {
    const pixels = await inspector.evaluate(async (outputs) => {
      const results = [];
      for (const output of outputs)
        for (const sample of output.results) {
          const pixels = [];
          for (const src of sample.images) {
            const image = new Image();
            image.src = src;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = 64;
            canvas.height = 64;
            const context = canvas.getContext("2d")!;
            context.drawImage(image, 0, 0);
            pixels.push([...context.getImageData(32, 32, 1, 1).data]);
          }
          results.push({ forceWebGL: output.forceWebGL, type: sample.type, pixels });
        }
      return results;
    }, result.outputs);
    await mkdir("artifacts/spatial-light-samples", { recursive: true });
    await writeFile("artifacts/spatial-light-samples/pixels.json", JSON.stringify(pixels, null, 2));
    for (const {
      pixels: [red, blue, dim],
    } of pixels) {
      expect(red![0]).toBeGreaterThan(100);
      expect(red![2]).toBeLessThan(10);
      expect(blue![2]).toBeGreaterThan(100);
      expect(blue![0]).toBeLessThan(10);
      expect(dim![2]).toBeGreaterThan(5);
      expect(dim![2]).toBeLessThan(blue![2]! - 50);
    }
    expect(result.readbacks).toMatchObject({ gpu: 0, canvas: 0, webgl: 0 });
  } finally {
    await inspector.close();
  }
});
