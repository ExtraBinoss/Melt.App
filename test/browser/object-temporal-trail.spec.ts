import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type * as Witness from "./support/object-temporal-trail";
import { installReadbackProbe } from "./support/readback-probe";

for (const forceWebGL of [false, true])
  test(`object Trail renders exact prior poses through moving groups and masks on ${forceWebGL ? "WebGL" : "WebGPU"}`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installReadbackProbe(page);
    await page.route("**/object-trail-witness", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Deterministic object Trail</title>",
      }),
    );
    await page.goto("/object-trail-witness");
    const result = await page.evaluate(
      async ({ url, forceWebGL }) => {
        const witness = (await import(url)) as typeof Witness;
        return witness.captureObjectTemporalTrail(forceWebGL);
      },
      { url: `/@fs${resolve("test/browser/support/object-temporal-trail.ts")}`, forceWebGL },
    );
    expect(result.backend).toBe(forceWebGL ? "webgl" : "webgpu");
    expect(result.unchanged).toBe(true);
    expect(result.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
    expect(result.reads?.canvasHook).toBe(true);
    expect(forceWebGL ? result.reads?.webglHook : result.reads?.gpuHook).toBe(true);
    expect(result.glErrors).toEqual([]);
    expect(result.gpuErrors).toEqual([]);
    expect(errors).toEqual([]);
    expect(result.activeStats!.cacheBytes).toBeLessThanOrEqual(96 * 1024 * 1024);
    expect(result.released).toMatchObject({ cacheBytes: 0, targets: 0 });
    for (const point of result.expected.echoes) {
      const bounds = result.expected.presentBounds;
      expect(
        point.x < bounds.x ||
          point.x >= bounds.x + bounds.width ||
          point.y < bounds.y ||
          point.y >= bounds.y + bounds.height,
      ).toBe(true);
    }
    const inspector = await browser.newPage();
    try {
      const pixels = await inspector.evaluate(async ({ images, expected }) => {
        const decoded = [];
        for (const image of images) {
          const source = new Image();
          source.src = image.png;
          await source.decode();
          const canvas = document.createElement("canvas");
          canvas.width = source.width;
          canvas.height = source.height;
          const context = canvas.getContext("2d")!;
          context.drawImage(source, 0, 0);
          decoded.push({
            ...image,
            width: canvas.width,
            height: canvas.height,
            pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
          });
        }
        const sample = (image: (typeof decoded)[number], point: { x: number; y: number }) => {
          const x = Math.floor(point.x * image.scale),
            y = Math.floor(point.y * image.scale);
          return Array.from(
            image.pixels.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4),
          );
        };
        const first = decoded.find((image) => image.name === "A")!,
          again = decoded.find((image) => image.name === "A-repeat")!,
          different = decoded.find((image) => image.name === "B")!;
        let replayDifferences = 0,
          timeDifferences = 0;
        for (let i = 0; i < first.pixels.length; i++) {
          if (first.pixels[i] !== again.pixels[i]) replayDifferences++;
          if (first.pixels[i] !== different.pixels[i]) timeDifferences++;
        }
        return {
          replayDifferences,
          timeDifferences,
          frames: decoded
            .filter((image) => image.name !== "B")
            .map((image) => ({
              name: image.name,
              width: image.width,
              height: image.height,
              present: sample(image, expected.present),
              echoes: expected.echoes.map((point) => sample(image, point)),
              maskedPresent: sample(image, expected.maskedPresent),
              neighbour: sample(image, expected.neighbour),
              absentNeighbourEchoes: expected.absentNeighbourEchoes.map((point) =>
                sample(image, point),
              ),
            })),
        };
      }, result);
      const directory = "artifacts/object-temporal-trail",
        backend = result.backend;
      await mkdir(directory, { recursive: true });
      await writeFile(
        `${directory}/${backend}.json`,
        JSON.stringify(
          {
            pixels,
            expected: result.expected,
            reads: result.reads,
            stats: result.activeStats,
            released: result.released,
          },
          null,
          2,
        ),
      );
      for (const image of result.images)
        await writeFile(
          `${directory}/${backend}-${image.name}.png`,
          Buffer.from(image.png.split(",")[1]!, "base64"),
        );
      expect(pixels.replayDifferences).toBe(0);
      expect(pixels.timeDifferences).toBeGreaterThan(40);
      for (const frame of pixels.frames) {
        expect(frame.width).toBe(frame.name === "A-zoom" ? 144 : 192);
        expect(frame.height).toBe(frame.name === "A-zoom" ? 96 : 128);
        expect(frame.present[0]).toBeGreaterThan(40);
        expect(frame.present[1]).toBeLessThan(5);
        expect(frame.present[2]).toBeLessThan(5);
        for (const echo of frame.echoes) {
          if (frame.name === "A-without-trail") expect(echo[0]).toBe(0);
          else expect(echo[0]).toBeGreaterThan(15);
          expect(echo[1]).toBeLessThan(5);
          expect(echo[2]).toBeLessThan(5);
        }
        expect(frame.maskedPresent.slice(0, 3)).toEqual([0, 0, 0]);
        expect(frame.neighbour[2]).toBeGreaterThan(220);
        expect(frame.neighbour[0]).toBeLessThan(5);
        for (const absent of frame.absentNeighbourEchoes)
          expect(absent.slice(0, 3)).toEqual([0, 0, 0]);
      }
    } finally {
      await inspector.close();
    }
  });
