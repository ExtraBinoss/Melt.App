import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { prepareVideoFixtures } from "../../../scripts/performance/prepare-video-fixtures";
import { installNativeVideoProbe } from "../../browser/support/native-video-probe";
import { installReadbackProbe } from "../../browser/support/readback-probe";
import { buildVideoWitness } from "./build-witness";
import { videoPlaybackWorkload } from "./workload";
import sources from "./sources.json";

const { values } = parseArgs({
  options: {
    output: { type: "string", default: "artifacts/video-playback" },
    baseline: { type: "string" },
    headed: { type: "boolean", default: false },
    gpu: { type: "boolean", default: false },
    vulkan: { type: "boolean", default: false },
    frames: { type: "string", default: "45" },
    origin: { type: "string", default: "http://127.0.0.1:6100" },
  },
});
const frameCount = Number(values.frames);
if (!Number.isInteger(frameCount) || frameCount < 20 || frameCount > 240)
  throw Error("Use 20–240 preparation samples per scenario.");
const output = resolve(values.output!);
await mkdir(output, { recursive: true });
const assets = await prepareVideoFixtures();
await buildVideoWitness(output, values.baseline);
const scenarios = [
  { name: "raw-4", count: 4, treatment: "raw", staged: false },
  { name: "raw-8", count: 8, treatment: "raw", staged: false },
  { name: "motion-8", count: 8, treatment: "motion", staged: false },
  { name: "motion-4-to-8", count: 8, treatment: "motion", staged: true },
  { name: "overload-12", count: 12, treatment: "raw", staged: false },
] as const;
const variants = values.baseline ? ["baseline", "candidate"] : ["candidate"];
const flags = [
  "--no-sandbox",
  ...(values.vulkan
    ? [
        "--enable-unsafe-webgpu",
        "--enable-unsafe-swiftshader",
        "--use-angle=vulkan",
        "--enable-features=Vulkan",
      ]
    : []),
];
const browser = await chromium.launch({ channel: "chrome", headless: !values.headed, args: flags });
const results: unknown[] = [];
try {
  const cdp = await browser.newBrowserCDPSession();
  const environment = {
    version: browser.version(),
    flags,
    headed: values.headed,
    system: await cdp.send("SystemInfo.getInfo"),
    frames: frameCount,
  };
  await writeFile(`${output}/environment.json`, JSON.stringify(environment, null, 2));
  for (const scenario of scenarios)
    for (const variant of variants) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      try {
        await installNativeVideoProbe(page);
        await installReadbackProbe(page);
        const entry = `${values.origin}/__video_witness_${variant}.js`;
        await page.route(entry, (route) =>
          route.fulfill({
            contentType: "text/javascript",
            path: `${output}/${variant}/witness.js`,
          }),
        );
        await page.route("**/__video_probe", (route) =>
          route.fulfill({
            contentType: "text/html",
            body: "<html><body style='margin:0'></body></html>",
          }),
        );
        await page.goto(`${values.origin}/__video_probe`);
        const project = videoPlaybackWorkload(
          assets,
          scenario.treatment,
          undefined,
          scenario.count,
          scenario.staged,
        );
        await writeFile(`${output}/${scenario.name}.project.json`, JSON.stringify(project));
        const urls = Object.fromEntries(
          sources.map((s, index) => [
            `lab-asset-${index}`,
            `/@fs${resolve("artifacts/video-stress/media", s.file)}`,
          ]),
        );
        console.info(`Start ${variant} ${scenario.name}`);
        const report = await page.evaluate(
          async ({ entry, project, urls, frameCount, gpu, staged }) => {
            const module = await import(/* @vite-ignore */ entry);
            const lab = await module.prepareVideoLab(project, urls, gpu);
            const timings: number[] = [],
              transitions: unknown[] = [];
            let error: string | null = null,
              stats = null,
              capture: string | null = null;
            try {
              for (let index = 0; index < frameCount; index++) {
                await new Promise(requestAnimationFrame);
                const pose = staged ? 210 + index : index;
                timings.push(await lab.frame(pose));
                if (staged && [0, 29, 30, 31].includes(index))
                  transitions.push({ pose, stats: lab.stats() });
              }
              stats = lab.stats();
              capture = lab.capture();
            } catch (failure) {
              error = String(failure);
              stats = lab.stats();
            } finally {
              await lab.dispose();
            }
            await new Promise((resolve) => setTimeout(resolve, 30));
            return {
              timings,
              transitions,
              error,
              stats,
              after: lab.stats(),
              capture,
              gpuSamples: lab.samples(),
              native: (window as unknown as { __musartNativeVideo: Record<string, number> })
                .__musartNativeVideo,
              reads: window.__musartVideoReadbacks,
            };
          },
          { entry, project, urls, frameCount, gpu: values.gpu, staged: scenario.staged },
        );
        const { capture, ...data } = report;
        if (capture)
          await writeFile(
            `${output}/${variant}-${scenario.name}.png`,
            Buffer.from(capture.split(",")[1]!, "base64"),
          );
        const warm = data.timings.slice(12).sort((a, b) => a - b);
        const row = {
          variant,
          scenario: scenario.name,
          ...data,
          warm: {
            samples: warm.length,
            p50: warm[Math.floor(warm.length * 0.5)],
            p95: warm[Math.floor(warm.length * 0.95)],
          },
        };
        results.push(row);
        await writeFile(`${output}/report.json`, JSON.stringify(results, null, 2));
        console.info(
          JSON.stringify({
            variant,
            scenario: scenario.name,
            error: data.error,
            warm: row.warm,
            native: data.native,
            reads: data.reads,
          }),
        );
        if (data.native.framesOpen || data.native.decodersOpen || data.native.duplicateCloses)
          throw Error("Native video resources leaked or were closed twice.");
        if (
          data.reads &&
          [data.reads.gpu, data.reads.webgl, data.reads.canvas, data.reads.videoFrame].some(
            (n) => n !== 0,
          )
        )
          throw Error("The rendering path performed a JavaScript pixel readback.");
        if (scenario.count <= 8 && variant === "candidate" && data.error) throw Error(data.error);
        if (scenario.count > 8 && !data.error?.includes("budget"))
          throw Error("Overload did not report its bounded admission failure.");
      } finally {
        await page.close();
      }
    }
} finally {
  await browser.close();
}
