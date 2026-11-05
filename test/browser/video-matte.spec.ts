import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installReadbackProbe } from "./support/readback-probe";
import { installNativeVideoProbe } from "./support/native-video-probe";

test("source-clock matte video decodes, seeks, trims and follows its moved owner without compositor readbacks", async ({
  page,
  context,
}) => {
  const directory = resolve("artifacts/video-background");
  await mkdir(directory, { recursive: true });
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/video-matte-witness.ts",
      "--target=browser",
      // Spatial decoder assets are lazy Vite URLs, unrelated to this 2D video witness.
      "--external=three/addons/libs/*",
      "--outfile",
      resolve(directory, "witness.js"),
    ],
    { stdio: "pipe" },
  );
  const bundle = await readFile(resolve(directory, "witness.js"), "utf8");
  await installReadbackProbe(page);
  await installNativeVideoProbe(page);
  await page.route("**/video-matte.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Video matte witness</title>",
    }),
  );
  await page.route("**/video-matte.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: bundle }),
  );
  await page.goto("/video-matte.html");
  const result = await page.evaluate(async () => {
    const url = "/video-matte.js";
    const witness = (await import(
      /* @vite-ignore */ url
    )) as typeof import("./support/video-matte-witness");
    return witness.runVideoMatteWitness();
  });
  expect(result.readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
  expect(result.images).toHaveLength(7);
  const inspection = await context.newPage();
  try {
    const colors = await inspection.evaluate(async (images) => {
      const values: number[][] = [];
      for (const image of images) {
        const decoded = new Image();
        decoded.src = image;
        await decoded.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 96;
        canvas.height = 64;
        const context = canvas.getContext("2d")!;
        context.drawImage(decoded, 0, 0);
        values.push([...context.getImageData(48, 32, 1, 1).data]);
      }
      return values;
    }, result.images);
    const expected = [
      [224, 32, 32],
      [255, 255, 255],
      [32, 32, 224],
      [255, 255, 255],
      [255, 255, 255],
      [32, 32, 224],
      [32, 32, 224],
    ];
    await writeFile(
      resolve(directory, "decoded-colors.json"),
      JSON.stringify({ colors, expected, stats: result.stats }, null, 2),
    );
    for (let frame = 0; frame < expected.length; frame++)
      for (let channel = 0; channel < 3; channel++)
        expect(Math.abs(colors[frame]![channel]! - expected[frame]![channel]!)).toBeLessThan(15);
  } finally {
    await inspection.close();
  }
});
