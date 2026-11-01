import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
let bundle: string, worker: string;
test.beforeAll(async () => {
  for (const [source, target] of [
    ["test/browser/support/material-effects-witness.ts", "witness.js"],
    ["packages/render/src/spatial/geometry.worker.ts", "geometry-worker.js"],
  ])
    execFileSync(
      "bun",
      [
        "build",
        source!,
        "--target=browser",
        "--external=*?url",
        `--outfile=artifacts/material-effects/${target}`,
      ],
      { stdio: "pipe" },
    );
  bundle = await readFile("artifacts/material-effects/witness.js", "utf8");
  worker = await readFile("artifacts/material-effects/geometry-worker.js", "utf8");
});
for (const forceWebGL of [false, true])
  test(`material effects render native ${forceWebGL ? "WebGL image/video/3D" : "WebGPU image/3D"} inputs and preserve alpha`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await installReadbackProbe(page);
    await page.route("**/material-renderer.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><script type="importmap">{"imports":{"harfbuzzjs/hb.wasm?url":"/material-font-url.js"}}</script>',
      }),
    );
    await page.route("**/material-font-url.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: 'export default "/unused-font.wasm";',
      }),
    );
    await page.route("**/assets/profiles/CRPC6-perceptual-rgb8.bin?url", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: 'export default "/unused-proof.bin";',
      }),
    );
    await page.route("**/material-witness.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: bundle }),
    );
    await page.route("**/geometry.worker.ts", (route) =>
      route.fulfill({ contentType: "text/javascript", body: worker }),
    );
    await page.goto("/material-renderer.html");
    const results = await page.evaluate(async (force) => {
      const path = "/material-witness.js";
      const witness = await import(/* @vite-ignore */ path);
      return witness.runMaterialEffects(force);
    }, forceWebGL);
    const load = results.find((item: { kind: string }) => item.kind === "50-image-load");
    if (load) {
      expect(load.stats.cacheBytes).toBeLessThanOrEqual(load.stats.maxBytes);
      expect(load.stats.uploads).toBe(2);
    }
    const counts = await page.evaluate(() => window.__musartVideoReadbacks);
    const inspector = await page.context().newPage();
    const checks = [];
    try {
      for (const result of results)
        for (const variant of result.variants) {
          const metrics = await inspector.evaluate(
            async ({ baseline, image, zero }) => {
              const pixels = async (src: string) => {
                const im = new Image();
                im.src = src;
                await im.decode();
                const c = document.createElement("canvas");
                c.width = im.width;
                c.height = im.height;
                const ctx = c.getContext("2d")!;
                ctx.drawImage(im, 0, 0);
                return ctx.getImageData(0, 0, c.width, c.height).data;
              };
              const [a, b, z] = await Promise.all([pixels(baseline), pixels(image), pixels(zero)]);
              let changed = 0,
                alpha = 0,
                identity = 0;
              for (let i = 0; i < a.length; i++) {
                if (i % 4 === 3) alpha = Math.max(alpha, Math.abs(a[i]! - b[i]!));
                else if (a[i] !== b[i]) changed++;
                identity = Math.max(identity, Math.abs(a[i]! - z[i]!));
              }
              return { changed, alpha, identity };
            },
            { baseline: result.baseline, ...variant },
          );
          checks.push({ kind: result.kind, type: variant.type, ...metrics });
          expect(metrics.changed).toBeGreaterThan(10);
          if (variant.type !== "displace") expect(metrics.alpha).toBeLessThanOrEqual(1);
          else expect(metrics.alpha).toBeGreaterThan(0);
          expect(
            metrics.identity,
            `${result.kind}: ${variant.type} amount zero`,
          ).toBeLessThanOrEqual(1);
        }
    } finally {
      await inspector.close();
    }
    expect(counts).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
    await mkdir("artifacts/material-effects/native", { recursive: true });
    await writeFile(
      `artifacts/material-effects/native/${forceWebGL ? "webgl" : "webgpu"}.json`,
      JSON.stringify({ checks, counts, results }, null, 2),
    );
  });
