import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import type * as Witness from "./support/object-dof";
import { installReadbackProbe } from "./support/readback-probe";

for (const forceWebGL of [false, true])
  test(`native object DOF and offscreen point focus on ${forceWebGL ? "WebGL" : "WebGPU"}`, async ({
    page,
    context,
  }) => {
    test.setTimeout(90000);
    await installReadbackProbe(page);
    await page.route("**/object-dof-witness", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Native object depth</title>",
      }),
    );
    await page.goto("/object-dof-witness");
    const result = await page.evaluate(
      async ({ url, forceWebGL }) => {
        const witness = (await import(url)) as typeof Witness;
        return witness.objectDofWitness(forceWebGL);
      },
      { url: `/@fs${resolve("test/browser/support/object-dof.ts")}`, forceWebGL },
    );
    expect(result.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
    expect(result.stats.cacheBytes).toBeLessThanOrEqual(result.stats.maxBytes);
    const decoder = await context.newPage();
    try {
      const pixels = await decoder.evaluate(async (result) => {
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
            height: image.height,
            bytes: ctx.getImageData(0, 0, image.width, image.height).data,
          };
        };
        const [base, blur, focused, full, crop] = await Promise.all(
          [result.baseline, result.blurred, result.focused, result.full, result.crop].map(decode),
        );
        let blurError = 0,
          focusError = 0,
          neighbourError = 0,
          cropError = 0,
          samples = 0;
        for (let y = 0; y < base!.height; y++)
          for (let x = 0; x < base!.width; x++) {
            const i = (y * base!.width + x) * 4;
            for (let c = 0; c < 3; c++) {
              if (x < 165) {
                blurError += Math.abs(base!.bytes[i + c]! - blur!.bytes[i + c]!);
                focusError += Math.abs(base!.bytes[i + c]! - focused!.bytes[i + c]!);
              } else neighbourError += Math.abs(base!.bytes[i + c]! - blur!.bytes[i + c]!);
            }
          }
        for (let y = 5; y < crop!.height - 5; y++)
          for (let x = 5; x < crop!.width - 5; x++) {
            const i = (y * full!.width + x) * 4,
              j = (y * crop!.width + x) * 4;
            for (let c = 0; c < 3; c++) {
              cropError += Math.abs(full!.bytes[i + c]! - crop!.bytes[j + c]!);
              samples++;
            }
          }
        return { blurError, focusError, neighbourError, cropError: cropError / samples };
      }, result);
      expect(pixels.blurError).toBeGreaterThan(1000);
      expect(pixels.focusError).toBeLessThan(pixels.blurError * 0.2);
      expect(pixels.neighbourError).toBe(0);
      expect(result.focus.x * 256).toBeGreaterThan(result.viewport.width);
      expect(pixels.cropError).toBeLessThan(1);
      expect(result.repeat).toBe(result.focused);
    } finally {
      await decoder.close();
    }
  });
