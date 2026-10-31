import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
let bundle: string, svg: string;
test.beforeAll(async () => {
  await mkdir("artifacts/svg-export", { recursive: true });
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/svg-video-quality.ts",
      "--target=browser",
      "--external=*.bin?url",
      "--outfile",
      "artifacts/svg-export/witness.js",
    ],
    { stdio: "pipe" },
  );
  bundle = await readFile("artifacts/svg-export/witness.js", "utf8");
  svg = await readFile("apps/web/src/ui/brand/assets/melt.svg", "utf8");
});
for (const forceWebGL of [false, true])
  test(`decoded MP4 retains SVG antialias coverage (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
    context,
  }) => {
    await installReadbackProbe(page);
    await context.route("**/*.bin?url", (route) =>
      route.fulfill({ contentType: "text/javascript", body: 'export default "/svg-proof.bin";' }),
    );
    await context.route("**/svg-proof.bin", async (route) =>
      route.fulfill({
        contentType: "application/octet-stream",
        body: await readFile("packages/render/assets/profiles/CRPC6-perceptual-rgb8.bin"),
      }),
    );
    await context.route("**/svg-font.ttf", async (route) =>
      route.fulfill({
        contentType: "font/ttf",
        body: await readFile("apps/web/public/fonts/inter/font.ttf"),
      }),
    );
    await context.route("**/svg-quality.html", (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html><title>SVG export</title>" }),
    );
    await context.route("**/svg-quality.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: bundle }),
    );
    await page.goto("/svg-quality.html");
    const result = await page.evaluate(
      async ({ svg, forceWebGL }) => {
        const url = "/svg-quality.js";
        const witness = (await import(
          /* @vite-ignore */ url
        )) as typeof import("./support/svg-video-quality");
        return witness.renderSvgVideo(svg, forceWebGL);
      },
      { svg, forceWebGL },
    );
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
      videoFrame: 0,
    });
    const inspector = await context.newPage();
    await inspector.goto("/svg-quality.html");
    try {
      const report = await inspector.evaluate(async (result) => {
        const url = "/svg-quality.js";
        const witness = (await import(
          /* @vite-ignore */ url
        )) as typeof import("./support/svg-video-quality");
        return witness.inspectSvgVideo(result);
      }, result);
      const backend = forceWebGL ? "webgl" : "webgpu";
      await writeFile(`artifacts/svg-export/${backend}.mp4`, Buffer.from(result.bytes));
      await writeFile(
        `artifacts/svg-export/${backend}-aliased.png`,
        Buffer.from(result.aliased.split(",")[1]!, "base64"),
      );
      await writeFile(
        `artifacts/svg-export/${backend}-antialiased.png`,
        Buffer.from(result.antialiased.split(",")[1]!, "base64"),
      );
      await writeFile(
        `artifacts/svg-export/${backend}-decoded.png`,
        Buffer.from(report.decoded.split(",")[1]!, "base64"),
      );
      await writeFile(
        `artifacts/svg-export/${backend}.json`,
        JSON.stringify({ ...report, decoded: undefined }, null, 2),
      );
      console.log(backend, { ...report, decoded: undefined });
      expect(report.textEdges).toBeGreaterThan(100);
      expect(report.textRmse).toBeLessThan(12);
      expect(report.frames).toBe(1);
      expect(report.edges).toBeGreaterThan(100);
      expect(report.aaRmse).toBeLessThan(report.aliasRmse * 0.8);
    } finally {
      await inspector.close();
    }
  });
