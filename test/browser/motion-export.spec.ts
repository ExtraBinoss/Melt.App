import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installReadbackProbe } from "./support/readback-probe";
import { installNativeVideoProbe } from "./support/native-video-probe";
const cohort = resolve("artifacts/motion/export");
test.beforeAll(async () => {
  await mkdir(cohort, { recursive: true });
});
async function verifyMotionExport(
  page: Page,
  context: BrowserContext,
  forceWebGL: boolean,
  container: "auto" | "webm" = "auto",
) {
  test.setTimeout(40000);
  await installReadbackProbe(page);
  await installNativeVideoProbe(page);
  await context.route("**/motion-export-witness.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Headless Motion export</title>",
    }),
  );
  await page.goto("/motion-export-witness.html", { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(
    async (options) => {
      const url = options.modulePath;
      const module = (await import(
        /* @vite-ignore */ url
      )) as typeof import("./support/motion-export-witness");
      return module.runMotionExportWitness(options.webgl, options.container);
    },
    {
      webgl: forceWebGL,
      container,
      modulePath: `/@fs${resolve("test/browser/support/motion-export-witness.ts")}`,
    },
  );
  const name = (forceWebGL ? "webgl" : "webgpu") + "-" + container;
  const { encoded, ...evidence } = result;
  expect(result.backend).toBe(forceWebGL ? "webgl" : "webgpu");
  if (container === "webm") expect(result.mimeType).toBe("video/webm");
  await writeFile(
    resolve(cohort, name + (result.mimeType === "video/mp4" ? ".mp4" : ".webm")),
    Buffer.from(encoded.split(",")[1]!, "base64"),
  );
  await writeFile(resolve(cohort, name + ".json"), JSON.stringify(evidence, null, 2));
  expect(result).toMatchObject({
    width: 64,
    height: 64,
    frameCount: 12,
    duration: { value: 37, rate: 100 },
    encodedDuration: { value: 37, rate: 100 },
    frameRate: { numerator: 30000, denominator: 1001 },
    projectUnchanged: true,
    cancelled: true,
    audio: { sampleRate: 48000, channels: 2, samples: 17760 },
  });
  expect(result.readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  expect(result.resources).toMatchObject({
    framesOpen: 0,
    decodersOpen: 0,
    duplicateCloses: 0,
  });
  expect(result.progress.at(-1)).toBe(1);
  const inspector = await context.newPage();
  try {
    await inspector.goto("/motion-export-witness.html", { waitUntil: "domcontentloaded" });
    const decoded = await inspector.evaluate(
      async ({ encoded, modulePath }) => {
        const url = modulePath;
        const module = (await import(
          /* @vite-ignore */ url
        )) as typeof import("./support/motion-export-witness");
        return module.inspectMotionFile(encoded);
      },
      { encoded, modulePath: `/@fs${resolve("test/browser/support/motion-export-witness.ts")}` },
    );
    await writeFile(resolve(cohort, name + "-decoded.json"), JSON.stringify(decoded, null, 2));
    expect(decoded).toMatchObject({ width: 64, height: 64, sampleRate: 48000, channels: 2 });
    expect(decoded.timeResolution).toBe(result.timestampResolution);
    const encodedEnd = result.encodedDuration.value / result.encodedDuration.rate;
    expect(decoded.videoDuration).toBeCloseTo(encodedEnd, 6);
    expect(decoded.duration).toBeCloseTo(Math.max(decoded.videoDuration, decoded.audioDuration), 6);
    // Native audio codecs pad their last packet; r1.63 now compensates priming
    // and exposes that packet tail. Video must still end at its exact authored tick.
    expect(decoded.audioDuration).toBeGreaterThanOrEqual(encodedEnd - 1 / decoded.sampleRate);
    expect(decoded.audioDuration).toBeLessThan(encodedEnd + decoded.audioPacketDuration);
    expect(decoded.frames).toHaveLength(12);
    for (let i = 0; i < decoded.frames.length; i++)
      expect(decoded.frames[i]!.timestamp).toBeCloseTo(
        Math.round(((i * 1001) / 30000) * result.timestampResolution) / result.timestampResolution,
        6,
      );
    const first = decoded.frames[0]!,
      last = decoded.frames.at(-1)!;
    expect(last.duration).toBeGreaterThan(0);
    expect(Math.abs(last.timestamp + last.duration - encodedEnd)).toBeLessThanOrEqual(2e-6);
    for (const [actual, expected] of [
      [first.center, [224, 32, 32]],
      [last.center, [32, 208, 64]],
      [first.left, [255, 255, 255]],
    ] as const)
      for (let channel = 0; channel < 3; channel++)
        expect(Math.abs(actual[channel]! - expected[channel]!)).toBeLessThan(25);
    expect(last.left[1]).toBeGreaterThan(last.left[0]! + 80);
    expect(decoded.audioRms[1]).toBeGreaterThan(0.055);
    expect(decoded.audioRms[1]).toBeLessThan(0.085);
    expect(decoded.audioRms[0]).toBeLessThan(0.01);
    expect(decoded.audioRms[2]).toBeLessThan(0.01);
  } finally {
    await inspector.close();
  }
}
for (const forceWebGL of [false, true])
  test(
    "authored composition exports and decodes original video plus timed audio (" +
      (forceWebGL ? "WebGL" : "WebGPU") +
      ")",
    async ({ page, context }) => verifyMotionExport(page, context, forceWebGL),
  );
test("explicit WebM preserves its shortened final video sample and native audio", async ({
  page,
  context,
}) => verifyMotionExport(page, context, false, "webm"));
