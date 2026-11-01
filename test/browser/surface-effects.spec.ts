import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
let bundle: string;
test.beforeAll(async () => {
  await mkdir("artifacts/surface-effects", { recursive: true });
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/surface-effects-witness.ts",
      "--target=browser",
      "--external=*?url",
      "--outfile=artifacts/surface-effects/witness.js",
    ],
    { stdio: "pipe" },
  );
  bundle = await readFile("artifacts/surface-effects/witness.js", "utf8");
});
for (const forceWebGL of [false, true])
  test(`static image effects, sorting correctness and 50-image GPU load (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
    context,
  }) => {
    test.setTimeout(90000);
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
    await page.route("**/surface-effects.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><script type="importmap">{"imports":{"harfbuzzjs/hb.wasm?url":"/unused-font.js"}}</script>',
      }),
    );
    await page.route("**/unused-font.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: 'export default "/unused.wasm";' }),
    );
    await page.route("**/assets/profiles/CRPC6-perceptual-rgb8.bin?url", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: 'export default "/unused-proof.bin";',
      }),
    );
    await page.route("**/surface-witness.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: bundle }),
    );
    await page.goto("/surface-effects.html");
    const results = await page.evaluate(async (force) => {
      const url = "/surface-witness.js";
      return (await import(/* @vite-ignore */ url)).surfaceEffectsWitness(force);
    }, forceWebGL);
    expect(results.backend).toBe(forceWebGL ? "webgl" : "webgpu");
    expect(results.readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
    expect(results.loaded.targets).toBeLessThanOrEqual(2);
    expect(results.loaded.materials).toBeLessThanOrEqual(results.warm.materials + 1); // one shared copy material for mixed stacks
    expect(results.loaded.bytes).toBeLessThan(96 * 64 * 4 * 4);
    const inspector = await context.newPage();
    try {
      const metrics = await inspector.evaluate(async (result) => {
        async function pixels(src: string) {
          const image = new Image();
          image.src = src;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(image, 0, 0);
          return ctx.getImageData(0, 0, image.width, image.height).data;
        }
        const baseline = await pixels(result.baseline);
        const variants = [];
        for (const variant of result.variants) {
          const [actual, later, zero] = await Promise.all([
            pixels(variant.image),
            pixels(variant.later),
            pixels(variant.zero),
          ]);
          let changed = 0,
            temporal = 0,
            identity = 0;
          for (let i = 0; i < actual.length; i++) {
            changed += Math.abs(actual[i]! - baseline[i]!) > 2 ? 1 : 0;
            temporal = Math.max(temporal, Math.abs(actual[i]! - later[i]!));
            identity = Math.max(identity, Math.abs(baseline[i]! - zero[i]!));
          }
          variants.push({ type: variant.type, changed, temporal, identity });
        }
        const sorted = await pixels(
            result.variants.find((v: { type: string }) => v.type === "pixel-sort")!.image,
          ),
          reverse = await pixels(result.reverse),
          partial = await pixels(result.partial);
        let ascending = true,
          descending = true,
          permutation = true,
          partialUntouched = true;
        for (let start = 0; start < 96; start += 32) {
          const before: number[] = [],
            after: number[] = [];
          for (let x = start; x < start + 32; x++) {
            const index = (10 * 96 + x) * 4;
            before.push(baseline[index]!);
            after.push(sorted[index]!);
            if (x > start) {
              ascending &&= sorted[index]! >= sorted[index - 4]!;
              descending &&= reverse[index]! <= reverse[index - 4]!;
            }
          }
          before.sort((a, b) => a - b);
          after.sort((a, b) => a - b);
          permutation &&= before.every((value, i) => Math.abs(value - after[i]!) <= 1);
        }
        for (let x = 64; x < 96; x++)
          for (let c = 0; c < 4; c++)
            partialUntouched &&=
              Math.abs(partial[(10 * 96 + x) * 4 + c]! - baseline[(10 * 96 + x) * 4 + c]!) <= 1;
        let transparent = 0;
        for (let y = 32; y < 64; y++)
          for (let x = 32; x < 64; x++) if (sorted[(y * 96 + x) * 4 + 3] === 0) transparent++;
        const kernels = [];
        for (const method of result.methods) {
          const data = await pixels(method.image);
          kernels.push({
            method: method.method,
            signal: Array.from(data).filter((v, i) => i % 4 !== 3 && v > 30).length,
          });
        }
        const imageBaseline = await pixels(
          result.imageOutputs.find((image: { type: string }) => image.type === "baseline").image,
        );
        const images = [];
        for (const image of result.imageOutputs) {
          if (image.type === "baseline") continue;
          const actual = await pixels(image.image);
          let changed = 0;
          for (let i = 0; i < actual.length; i++)
            if (Math.abs(actual[i]! - imageBaseline[i]!) > 2) changed++;
          images.push({ type: image.type, changed });
        }
        return {
          variants,
          images,
          ascending,
          descending,
          permutation,
          partialUntouched,
          transparent,
          kernels,
        };
      }, results);
      await writeFile(
        `artifacts/surface-effects/${results.backend}-diagnostic.json`,
        JSON.stringify({ metrics, errors }, null, 2),
      );
      for (const image of results.imageOutputs)
        await writeFile(
          `artifacts/surface-effects/${results.backend}-image-${image.type}.png`,
          Buffer.from(image.image.split(",")[1], "base64"),
        );
      for (const variant of results.variants)
        await writeFile(
          `artifacts/surface-effects/${results.backend}-${variant.type}.png`,
          Buffer.from(variant.image.split(",")[1], "base64"),
        );
      for (const variant of metrics.variants) {
        expect(variant.changed, variant.type).toBeGreaterThan(10);
        expect(variant.temporal).toBe(0);
        expect(variant.identity).toBeLessThanOrEqual(1);
      }
      expect(metrics).toMatchObject({
        ascending: true,
        descending: true,
        permutation: true,
        partialUntouched: true,
        transparent: 1024,
      });
      for (const kernel of metrics.kernels)
        expect(kernel.signal, kernel.method).toBeGreaterThan(10);
      expect(results.density).toBe(
        results.variants.find((v: { type: string }) => v.type === "pixel-sort").image,
      );
      expect(results.repeated).toBe(
        results.variants.find((v: { type: string }) => v.type === "pixel-sort").image,
      );
      for (const image of metrics.images) expect(image.changed, image.type).toBeGreaterThan(10);
      for (const variant of results.variants)
        await writeFile(
          `artifacts/surface-effects/${results.backend}-${variant.type}.png`,
          Buffer.from(variant.image.split(",")[1], "base64"),
        );
      await writeFile(
        `artifacts/surface-effects/${results.backend}.json`,
        JSON.stringify(
          { metrics, warm: results.warm, loaded: results.loaded, readbacks: results.readbacks },
          null,
          2,
        ),
      );
      expect(errors).toEqual([]);
    } finally {
      await inspector.close();
    }
  });
