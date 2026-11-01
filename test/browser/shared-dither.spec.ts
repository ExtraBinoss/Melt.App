import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { sharedDitherWitness } from "./support/shared-dither-witness";
import { installReadbackProbe } from "./support/readback-probe";
import { imageDifference } from "./support/photographic-effect";
let bundle: string;
test.beforeAll(async () => {
  await mkdir("artifacts/effect-placement", { recursive: true });
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/shared-dither-witness.ts",
      "--target=browser",
      "--outfile",
      "artifacts/effect-placement/shared-dither.js",
    ],
    { stdio: "pipe" },
  );
  bundle = await readFile("artifacts/effect-placement/shared-dither.js", "utf8");
});
for (const webgl of [false, true])
  test(`shared Dither retains legacy pixels and matches all binary methods (${webgl ? "WebGL" : "WebGPU"})`, async ({
    page,
    context,
  }, info) => {
    await installReadbackProbe(page);
    await page.route("**/shared-dither.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Dither parity</title>",
      }),
    );
    await page.route("**/shared-dither.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: bundle }),
    );
    await page.goto("/shared-dither.html");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const result = await page.evaluate(async (webgl) => {
      const path = "/shared-dither.js";
      const module = (await import(/* @vite-ignore */ path)) as {
        sharedDitherWitness: typeof sharedDitherWitness;
      };
      return module.sharedDitherWitness(webgl);
    }, webgl);
    expect(result.backend).toBe(webgl ? "webgl" : "webgpu");
    expect(result.readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
    expect(result.comparisons).toHaveLength(24);
    const inspector = await context.newPage();
    const differences = [];
    try {
      for (const pair of result.comparisons) {
        const difference = await imageDifference(inspector, pair.old, pair.current);
        expect(difference.alphaMax, pair.name).toBe(0);
        expect(difference.maxByte, pair.name).toBeLessThanOrEqual(1);
        differences.push({ name: pair.name, ...difference });
      }
    } finally {
      await inspector.close();
    }
    expect(errors).toEqual([]);
    const report = JSON.stringify({
      browser: result.browser,
      backend: result.backend,
      readbacks: result.readbacks,
      differences,
    });
    await writeFile(`artifacts/effect-placement/dither-${result.backend}.json`, report);
    await info.attach("dither-parity", {
      contentType: "application/json",
      body: report,
    });
  });
