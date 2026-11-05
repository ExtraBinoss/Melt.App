import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  modelUrl,
  VIDEO_BACKGROUND_MODEL,
} from "../apps/web/src/services/selection/model/manifest";
import type { RvmVerification } from "../test/browser/support/rvm-video-matte";

// Run against Vite: MUSART_BASE_URL=http://127.0.0.1:6100 bun scripts/verify-video-matte.ts
// Optional offline weights: MUSART_RVM_MODEL=/path/to/the/pinned/model.onnx (hash checked by app).
const baseURL = process.env.MUSART_BASE_URL ?? "http://127.0.0.1:6100";
const directory = resolve("artifacts/rvm-second-skin-verification");
await mkdir(directory, { recursive: true });
const report: Record<string, unknown> = {
  checkedAt: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  model: VIDEO_BACKGROUND_MODEL,
  source: "apps/web/public/templates/motion/second-skin/media/second-skin-dancer.mp4",
  notes: [
    "Real pinned weights, full 250-frame source, native encoding and transparent GPU exports.",
    "Functional verification against Vite; not a production latency benchmark.",
  ],
};
const browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--enable-unsafe-webgpu",
    "--enable-unsafe-swiftshader",
    "--use-angle=vulkan",
    "--enable-features=Vulkan",
  ],
});
try {
  report.browser = browser.version();
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  page.on("console", (message) => {
    if (message.text().startsWith("RVM source time")) console.log(message.text());
  });
  if (process.env.MUSART_RVM_MODEL) {
    const bytes = await readFile(process.env.MUSART_RVM_MODEL);
    await page.route(modelUrl("rvm_mobilenetv3_fp16.onnx", VIDEO_BACKGROUND_MODEL), (route) =>
      route.fulfill({
        body: bytes,
        contentType: "application/octet-stream",
        headers: { "access-control-allow-origin": "*" },
      }),
    );
  }
  await page.route("**/rvm-verification.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>RVM verification</title>",
    }),
  );
  await page.goto(`${baseURL}/rvm-verification.html`);
  report.adapter = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) throw Error("No native WebGPU adapter.");
    const { vendor, architecture, device, description, isFallbackAdapter } = adapter.info;
    return { vendor, architecture, device, description, isFallbackAdapter };
  });
  const witnessURL = `/@fs${resolve("test/browser/support/rvm-video-matte.ts")}`;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const result: RvmVerification = await Promise.race([
    page.evaluate(async (url) => {
      const witness = (await import(/* @vite-ignore */ url)) as {
        verifyRvmVideoMatte(): Promise<RvmVerification>;
      };
      return witness.verifyRvmVideoMatte();
    }, witnessURL),
    new Promise<never>((_, reject) => {
      deadline = setTimeout(
        () => reject(Error("Real video matting exceeded five minutes.")),
        300000,
      );
    }),
  ]).finally(() => clearTimeout(deadline));
  const save = async (name: string, url: string) => {
    await writeFile(resolve(directory, name), Buffer.from(url.split(",")[1]!, "base64"));
  };
  await save(result.mime === "video/mp4" ? "matte.mp4" : "matte.webm", result.matte);
  for (const mask of result.masks) await save(`mask-${mask.time}.png`, mask.image);
  for (const frame of result.exports) await save(`${frame.backend}-${frame.time}.png`, frame.image);
  const { matte: _matte, masks, exports, ...summary } = result;
  Object.assign(report, summary, {
    masks: masks.map(({ image: _image, ...stats }) => stats),
    exports: exports.map(({ image: _image, ...stats }) => stats),
    ok: true,
  });
} catch (error) {
  report.ok = false;
  report.failure =
    error instanceof Error ? { message: error.message, stack: error.stack } : String(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(resolve(directory, "report.json"), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      ok: report.ok,
      report: resolve(directory, "report.json"),
      failure: report.failure,
    }),
  );
}
