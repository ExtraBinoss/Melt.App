/** Native DOM preparation comparison. No app server/build is needed.
 * bun scripts/performance/vector-toolkit.ts [--visual] [--paired-only] [--samples=12]
 * Run serially with low priority and the bounded scope in docs/performance/protocol.md.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { basename, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { installReadbackProbe } from "../../test/browser/support/readback-probe";
import { vectorWorkloads } from "./vector-workloads";

const samples = Number(
  process.argv.find((value) => value.startsWith("--samples="))?.split("=")[1] ?? 12,
);
if (!Number.isInteger(samples) || samples < 1 || samples > 100)
  throw Error("samples must be 1–100");
const pairedOnly = process.argv.includes("--paired-only");
const output = resolve(pairedOnly ? "artifacts/vector-toolkit-paired" : "artifacts/vector-toolkit");
await mkdir(output, { recursive: true });
const build = await Bun.build({
  entrypoints: ["scripts/performance/vector-browser.ts"],
  target: "browser",
  minify: false,
  sourcemap: "external",
  outdir: `${output}/bundle`,
});
if (!build.success) throw new AggregateError(build.logs, "Vector benchmark bundle failed");
const javascript = build.outputs.find((file) => file.path.endsWith(".js"))!;
const bundle = await javascript.text();
for (const file of build.outputs)
  await writeFile(`${output}/${basename(file.path)}`, new Uint8Array(await file.arrayBuffer()));
const provenance = {
  commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  status: execFileSync("git", ["status", "--short"], { encoding: "utf8" }),
  command: process.argv,
};
await writeFile(
  `${output}/source.diff`,
  execFileSync("git", [
    "diff",
    "--",
    "packages/render/src/surface/vector",
    "packages/render/test/surface/vector",
    "scripts/performance/vector-*",
  ]),
);
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: (request) =>
    new URL(request.url).pathname === "/benchmark.js"
      ? new Response(bundle, { headers: { "Content-Type": "text/javascript" } })
      : new Response(
          '<!doctype html><style>body{margin:0;background:#17171b}</style><script type="module" src="/benchmark.js"></script>',
          { headers: { "Content-Type": "text/html" } },
        ),
});
const browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--enable-unsafe-webgpu",
    "--enable-unsafe-swiftshader",
    "--use-angle=vulkan",
    "--enable-features=Vulkan",
  ],
});
const results: unknown[] = [],
  paired: unknown[] = [],
  visual: unknown[] = [];
try {
  for (let workload = 0; !pairedOnly && workload < vectorWorkloads.length; workload++) {
    // Fresh page/module realm for each first preparation. Alternate implementation order.
    const modes = workload % 2 ? ["batch", "baseline"] : ["baseline", "batch"];
    const pair: { geometry: unknown }[] = [];
    for (const mode of modes) {
      const page = await browser.newPage({
        viewport: { width: 512, height: 512 },
        deviceScaleFactor: 1,
      });
      try {
        await page.goto(server.url.href);
        await page.waitForFunction(() => "vectorBenchmark" in window);
        const result = await page.evaluate(
          async ({ mode, workload, samples }) => {
            const api = window as unknown as {
              vectorBenchmark: (
                mode: string,
                workload: number,
                samples: number,
              ) => Promise<{ geometry: unknown }>;
            };
            return api.vectorBenchmark(mode, workload, samples);
          },
          { mode, workload, samples },
        );
        pair.push(result);
        results.push(result);
      } finally {
        await page.close();
      }
    }
    if (JSON.stringify(pair[0]!.geometry) !== JSON.stringify(pair[1]!.geometry))
      throw Error(`Geometry mismatch: ${vectorWorkloads[workload]!.name}`);
  }
  for (let workload = 0; workload < vectorWorkloads.length; workload++) {
    const page = await browser.newPage({
      viewport: { width: 512, height: 512 },
      deviceScaleFactor: 1,
    });
    try {
      await page.goto(server.url.href);
      await page.waitForFunction(() => "vectorPairedBenchmark" in window);
      paired.push(
        await page.evaluate(
          async ({ workload, samples }) => {
            const api = window as unknown as {
              vectorPairedBenchmark: (workload: number, samples: number) => Promise<unknown>;
            };
            return api.vectorPairedBenchmark(workload, samples);
          },
          { workload, samples },
        ),
      );
    } finally {
      await page.close();
    }
  }
  if (process.argv.includes("--visual")) {
    for (const forceWebGL of [false, true]) {
      let reference: Buffer | undefined;
      for (const mode of ["baseline", "batch"]) {
        const page = await browser.newPage({
          viewport: { width: 512, height: 512 },
          deviceScaleFactor: 1,
        });
        try {
          await installReadbackProbe(page);
          await page.goto(server.url.href);
          await page.waitForFunction(() => "vectorWitness" in window);
          const info = await page.evaluate(
            async ({ mode, forceWebGL }) => {
              const api = window as unknown as {
                vectorWitness: (
                  mode: string,
                  webgl: boolean,
                ) => Promise<{ info: unknown; release: () => Promise<void> }>;
              };
              const result = await api.vectorWitness(mode, forceWebGL);
              Object.assign(window, { releaseVectorWitness: result.release });
              return result.info;
            },
            { mode, forceWebGL },
          );
          const name = `${forceWebGL ? "webgl" : "webgpu"}-${mode}`;
          const screenshot = await page
            .locator("#witness")
            .screenshot({ path: `${output}/${name}.png` });
          const readbacks = await page.evaluate(() => window.__musartVideoReadbacks);
          if (
            !readbacks ||
            readbacks.gpu ||
            readbacks.webgl ||
            readbacks.canvas ||
            readbacks.videoFrame
          )
            throw Error(`Unexpected production readbacks: ${JSON.stringify(readbacks)}`);
          const inspection = await browser.newPage();
          let paintedPixels: number;
          try {
            paintedPixels = await inspection.evaluate(
              async (data) => {
                const image = new Image();
                image.src = data;
                await image.decode();
                const canvas = document.createElement("canvas");
                canvas.width = image.width;
                canvas.height = image.height;
                const context = canvas.getContext("2d")!;
                context.drawImage(image, 0, 0);
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
                let count = 0;
                for (let i = 0; i < pixels.length; i += 4)
                  if (pixels[i]! > 70 || pixels[i + 1]! > 70 || pixels[i + 2]! > 70) count++;
                return count;
              },
              `data:image/png;base64,${screenshot.toString("base64")}`,
            );
          } finally {
            await inspection.close();
          }
          if (paintedPixels < 10000)
            throw Error(`Blank/incomplete witness: ${name} (${paintedPixels} pixels)`);
          if (reference && !reference.equals(screenshot))
            throw Error(`Native witness pixels differ: ${name}`);
          reference = screenshot;
          visual.push({
            name,
            exactScreenshotEquality: mode === "batch",
            paintedPixels,
            readbacks,
            info,
          });
          await page.evaluate(async () => {
            await (
              window as unknown as { releaseVectorWitness: () => Promise<void> }
            ).releaseVectorWitness();
          });
        } finally {
          await page.close();
        }
      }
    }
  }
  const report = {
    generated: new Date().toISOString(),
    provenance,
    browser: browser.version(),
    runtime: process.versions,
    platform: process.platform,
    architecture: process.arch,
    viewport: [512, 512],
    dpr: 1,
    notes: [
      "Synthetic vector source workloads; no application bootstrap or input latency measured.",
      "First preparation uses a fresh page realm. Repeated timings rebuild geometry; retained app cache hits do not.",
      "Paired warm samples alternate order in the same page after eight common warmup pairs; natural GC remains included.",
      "Diagnostic phase times overlap and are collected separately from uninstrumented totals.",
      "Geometry bytes are exact CPU typed-buffer bytes, not heap usage or driver/GPU residency.",
    ],
    results,
    paired,
    visual,
  };
  await writeFile(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await server.stop(true);
}
