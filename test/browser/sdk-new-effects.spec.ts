import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { imageDifference } from "./support/photographic-effect";
import type * as Witness from "./support/sdk-new-effects";

async function alphaMetrics(page: Page, url: string) {
  return page.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
    let sum = 0,
      right = 0,
      rise = 0,
      outsideBright = 0;
    for (let y = 0; y < image.height; y++)
      for (let x = 0; x < image.width; x++) {
        const a = pixels[(y * image.width + x) * 4 + 3]!;
        sum += a;
        if (x >= 65) right += a;
        if (x < 66 || x >= 78 || y < 50 || y >= 62) outsideBright += a;
      }
    for (let x = 79; x < image.width; x++) {
      const at = (56 * image.width + x) * 4 + 3;
      rise = Math.max(rise, pixels[at]! - pixels[at - 4]!);
    }
    return { sum, right, rise, outsideBright };
  }, url);
}

for (const forceWebGL of [false, true]) {
  test(`SDK treatments render, localize and export via ${forceWebGL ? "WebGL" : "WebGPU"}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installReadbackProbe(page);
    await page.route("**/__sdk-new-effects", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Native SDK effects</title>",
      }),
    );
    await page.goto("/__sdk-new-effects");
    const photo = {
      id: "photo",
      name: "Photographic calibration",
      mime: "image/jpeg",
      width: 512,
      height: 512,
      dataUrl: `data:image/jpeg;base64,${(await readFile("apps/web/public/benchmark/50-waterfall-5.jpg")).toString("base64")}`,
    };
    const result = await page.evaluate(
      async ({ forceWebGL, photo, path }) => {
        const witness = (await import(/* @vite-ignore */ path)) as typeof Witness;
        return witness.newEffectsWitness(forceWebGL, photo);
      },
      { forceWebGL, photo, path: `/@fs${resolve("test/browser/support/sdk-new-effects.ts")}` },
    );
    const reads = await page.evaluate(() => window.__musartVideoReadbacks);
    const inspector = await page.context().newPage();
    const metrics = [];
    const backend = forceWebGL ? "webgl" : "webgpu";
    await mkdir(`artifacts/sdk-effects/${backend}`, { recursive: true });
    try {
      for (const variant of result.variants) {
        const compare = (a: string, b: string) => imageDifference(inspector, a, b);
        const mask = await alphaMetrics(inspector, variant.masked);
        expect(mask.sum, `${variant.type} retained masked paint`).toBeGreaterThan(0);
        expect(mask.right, `${variant.type} mask clips expanded effect`).toBe(0);
        const zero = await compare(result.baseline, variant.zero);
        expect(zero.maxByte, `${variant.type} identity`).toBeLessThanOrEqual(2);
        const changed = await compare(result.baseline, variant.image);
        expect(changed.differentBytes, `${variant.type} visible treatment`).toBeGreaterThan(50);
        for (const key of ["partial", "alternate", "localized"] as const) {
          const difference = await compare(variant.image, variant[key]);
          expect(difference.differentBytes, `${variant.type} ${key}`).toBeGreaterThan(10);
        }
        const group = await compare(result.baseline, variant.group);
        for (const scope of ["group", "composition"] as const) {
          expect(
            (await compare(result.baseline, variant[scope])).differentBytes,
            `${variant.type} ${scope}`,
          ).toBeGreaterThan(50);
          const bypass = scope === "group" ? variant.groupZero : variant.compositionZero;
          expect(
            (await compare(result.baseline, bypass)).maxByte,
            `${variant.type} ${scope} identity`,
          ).toBeLessThanOrEqual(2);
        }
        await writeFile(
          `artifacts/sdk-effects/${backend}/${variant.type}.png`,
          Buffer.from(variant.image.split(",")[1]!, "base64"),
        );
        metrics.push({ type: variant.type, zero, changed, group });
      }
      expect(
        (await imageDifference(inspector, result.order[0]!, result.order[1]!)).differentBytes,
      ).toBeGreaterThan(10);
      for (const calibration of result.glowCalibration) {
        const alpha = await alphaMetrics(inspector, calibration.image);
        expect(
          alpha.outsideBright,
          `radius ${calibration.radius} transparent halo`,
        ).toBeGreaterThan(0);
        expect(
          alpha.rise,
          `radius ${calibration.radius} no isolated highlight replicas`,
        ).toBeLessThanOrEqual(2);
        await writeFile(
          `artifacts/sdk-effects/${backend}/glow-radius-${calibration.radius}.png`,
          Buffer.from(calibration.image.split(",")[1]!, "base64"),
        );
      }
      expect((await alphaMetrics(inspector, result.blackGlow)).sum).toBe(0);
      expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
      expect(result.stats.cacheBytes).toBeLessThanOrEqual(result.stats.maxBytes);
      expect(errors).toEqual([]);
      await writeFile(
        `artifacts/sdk-effects/${backend}/report.json`,
        JSON.stringify(
          { metrics, reads, stats: result.stats, browser: page.context().browser()?.version() },
          null,
          2,
        ),
      );
      if (!forceWebGL) {
        const stats = await page.evaluate(
          async ({ photo, path }) => {
            return ((await import(/* @vite-ignore */ path)) as typeof Witness).newEffectsLoad(
              photo,
            );
          },
          { photo, path: `/@fs${resolve("test/browser/support/sdk-new-effects.ts")}` },
        );
        expect(stats.cacheBytes).toBeLessThanOrEqual(stats.maxBytes);
        expect(stats.uploads).toBe(1);
        expect(stats.readbacks).toBe(0);
        const loadReads = await page.evaluate(() => window.__musartVideoReadbacks);
        expect(loadReads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
        await writeFile("artifacts/sdk-effects/50-images.json", JSON.stringify(stats, null, 2));
      }
    } finally {
      await inspector.close();
    }
  });
}
