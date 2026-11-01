import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { imageDifference } from "./support/photographic-effect";
let bundle: string, photos: string[];
test.beforeAll(async () => {
  await mkdir("artifacts/ascii-native", { recursive: true });
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/ascii-native-witness.ts",
      "--target=browser",
      "--outfile",
      "artifacts/ascii-native/witness.js",
    ],
    { stdio: "pipe" },
  );
  bundle = await readFile("artifacts/ascii-native/witness.js", "utf8");
  const manifest = JSON.parse(
    await readFile("apps/web/public/benchmark/manifest.json", "utf8"),
  ) as { images: { file: string }[] };
  const files = manifest.images;
  photos = await Promise.all(
    files
      .slice(0, 50)
      .map(
        async ({ file }) =>
          `data:image/jpeg;base64,${(await readFile("apps/web/public/benchmark/" + file)).toString("base64")}`,
      ),
  );
  expect(photos).toHaveLength(50);
});
for (const webgl of [false, true])
  test(`ASCII legacy fidelity, custom palettes and bounded 50-image glyph churn (${webgl ? "WebGL" : "WebGPU"})`, async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    await installReadbackProbe(page);
    await page.route("**/ascii-native.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>ASCII native witness</title>",
      }),
    );
    await page.route("**/ascii-native.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: bundle }),
    );
    await page.goto("/ascii-native.html");
    const result = await page.evaluate(
      async ({ webgl, photos }) => {
        const path = "/ascii-native.js";
        const module = (await import(
          /* @vite-ignore */ path
        )) as typeof import("./support/ascii-native-witness");
        return module.asciiNativeWitness(webgl, photos);
      },
      { webgl, photos },
    );
    expect(result.backend).toBe(webgl ? "webgl" : "webgpu");
    expect(result.readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
    expect(result.stats).toMatchObject({
      passes: 102,
      materials: 2,
      targets: 1,
      bytes: 8 * 18 * 1024 + 64 * 48 * 4,
    });
    expect(result.disposed).toMatchObject({ materials: 0, targets: 0, bytes: 0 });
    const inspect = await context.newPage();
    const differences = [];
    try {
      for (const pair of result.comparisons!) {
        const diff = await imageDifference(inspect, pair.old, pair.current);
        expect(diff.alphaMax).toBe(0);
        expect(diff.maxByte).toBeLessThanOrEqual(1);
        differences.push(diff);
      }
      const replay = await imageDifference(inspect, result.first!, result.firstAgain!);
      expect(replay.maxByte).toBe(0);
      const changed = await imageDifference(
        inspect,
        result.comparisons![0]!.current,
        result.variants![1]!,
      );
      expect(changed.meanRGB).toBeGreaterThan(10);
      const color = await inspect.evaluate(async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let pink = 0,
          blue = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] !== 255) continue;
          if (data[i]! > 180 && data[i + 2]! > 50 && data[i + 1]! < 100) pink++;
          if (data[i]! < 45 && data[i + 2]! > 60) blue++;
        }
        return { pink, blue };
      }, result.variants![1]!);
      expect(color.pink).toBeGreaterThan(50);
      expect(color.blue).toBeGreaterThan(50);
      const gradient = await inspect.evaluate(async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const { data } = context.getImageData(0, 0, image.width, image.height);
        const sides = [
          { red: 0, blue: 0 },
          { red: 0, blue: 0 },
        ];
        for (let y = 0; y < image.height; y++)
          for (let x = 40; x < image.width; x++) {
            if (x >= 56 && x < 104) continue;
            const i = (y * image.width + x) * 4;
            if (data[i + 3] !== 255) continue;
            const side = sides[x < 56 ? 0 : 1]!;
            side.red += data[i]!;
            side.blue += data[i + 2]!;
          }
        return sides;
      }, result.variants![3]!);
      expect(gradient[0]!.red).toBeGreaterThan(gradient[0]!.blue * 1.3);
      expect(gradient[1]!.blue).toBeGreaterThan(gradient[1]!.red * 2);
      expect(
        (await imageDifference(inspect, result.variants![3]!, result.variants![4]!)).meanRGB,
      ).toBeGreaterThan(10);
      const prefix = `artifacts/ascii-native/${result.backend}`;
      await writeFile(prefix + "-grid.png", Buffer.from(result.grid!.split(",")[1]!, "base64"));
      await writeFile(
        prefix + "-palette.png",
        Buffer.from(result.variants![1]!.split(",")[1]!, "base64"),
      );
      await writeFile(
        prefix + ".json",
        JSON.stringify(
          {
            backend: result.backend,
            browser: result.browser,
            adapter: result.adapter,
            stats: result.stats,
            disposed: result.disposed,
            readbacks: result.readbacks,
            differences,
            replay,
            color,
            stressMs: result.stressMs,
          },
          null,
          2,
        ),
      );
    } finally {
      await inspect.close();
    }
  });
