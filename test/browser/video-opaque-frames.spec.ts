import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const folder = "artifacts/video-opaque-frames";
let bundle: string;
test.beforeAll(async () => {
  await mkdir(folder, { recursive: true });
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/video-opaque-frames.ts",
      "--target=browser",
      "--format=esm",
      `--outfile=${resolve(folder, "fixture.js")}`,
    ],
    { stdio: "pipe" },
  );
  bundle = await readFile(`${folder}/fixture.js`, "utf8");
});

for (const webgl of [false, true])
  test(`opaque RGB video ignores X padding without changing actual alpha (${webgl ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    await page.route("**/__video-opacity", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body></body></html>",
      }),
    );
    await page.route("**/__video-opacity.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: bundle }),
    );
    await page.goto("/__video-opacity");
    const result = await page.evaluate(async (webgl) => {
      const moduleUrl = new URL("/__video-opacity.js", location.href).href;
      const { inspectOpaqueVideoFrames } = (await import(
        moduleUrl
      )) as typeof import("./support/video-opaque-frames");
      return inspectOpaqueVideoFrames(webgl);
    }, webgl);
    await writeFile(
      `${folder}/${webgl ? "webgl" : "webgpu"}.json`,
      JSON.stringify(result, null, 2),
    );
    expect(result.webgl).toBe(webgl);
    expect(result.closed).toBe(result.samples.length);
    expect(result.stats.pending).toBe(0);
    expect(result.stats.slots).toBe(1);
    for (const sample of result.samples) {
      const opaque = sample.format.endsWith("X");
      expect(sample.pixel[3]).toBe(opaque ? 255 : sample.padding);
      if (opaque || sample.padding >= 127) {
        const expected = sample.format.startsWith("BG") ? [180, 80, 30] : [30, 80, 180];
        for (let channel = 0; channel < 3; channel++)
          expect(Math.abs(sample.pixel[channel]! - expected[channel]!)).toBeLessThanOrEqual(2);
      }
    }
  });
