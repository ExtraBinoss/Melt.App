import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { imageDifference } from "./support/photographic-effect";
import { installReadbackProbe } from "./support/readback-probe";

const folder = "artifacts/effect-surfaces";
let bundle: string;
test.beforeAll(async () => {
  await mkdir(folder, { recursive: true });
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/effect-surfaces-witness.ts",
      "--target=browser",
      "--format=esm",
      `--outfile=${folder}/witness.js`,
    ],
    { stdio: "pipe" },
  );
  bundle = await readFile(`${folder}/witness.js`, "utf8");
});
for (const forceWebGL of [false, true]) {
  test(`alternating multi-stage effect surfaces keep native allocations and decoded pixels stable (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    const messages: { type: string; text: string }[] = [];
    page.on("console", (message) => {
      if (message.type() === "warning" || message.type() === "error")
        messages.push({ type: message.type(), text: message.text() });
    });
    page.on("pageerror", (error) => messages.push({ type: "pageerror", text: error.message }));
    await installReadbackProbe(page);
    await page.route("**/__effect-surfaces", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Effect surface witness</title>",
      }),
    );
    await page.route("**/__effect-surfaces.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: bundle }),
    );
    await page.goto("/__effect-surfaces");
    const result = await page.evaluate(async (forceWebGL) => {
      const path = "/__effect-surfaces.js";
      const module = (await import(
        /* @vite-ignore */ path
      )) as typeof import("./support/effect-surfaces-witness");
      return module.effectSurfacesWitness(forceWebGL);
    }, forceWebGL);
    // Preserve all captures and native evidence even when an acceptance assertion fails.
    const snapshots = {
      reference: result.references,
      actual: result.actual,
    };
    for (const [phase, images] of Object.entries(snapshots)) {
      for (const [index, image] of images.entries())
        await writeFile(
          `${folder}/${result.backend}-${phase}-${index}.png`,
          Buffer.from(image.split(",")[1]!, "base64"),
        );
    }
    await writeFile(
      `${folder}/${result.backend}-raw.json`,
      JSON.stringify(
        {
          ...result,
          references: undefined,
          actual: undefined,
          messages,
        },
        null,
        2,
      ),
    );
    expect(result.backend).toBe(forceWebGL ? "webgl" : "webgpu");
    // A preparation-only sampled surface may be initialized again on its first
    // framebuffer use. Both native paths must be allocation-free after warmup.
    expect(result.warmed.allocations - result.cold.allocations).toBeGreaterThanOrEqual(4);
    expect(result.warmed.allocations - result.cold.allocations).toBeLessThanOrEqual(5);
    expect(result.after).toEqual(result.warmed);
    expect(result.warmStats).toMatchObject({ targets: 4, bytes: 80 * 24 * 16 });
    expect(result.stats.bytes).toBe(result.warmStats.bytes);
    expect(result.projected).toEqual(Array(50).fill(result.stats.bytes));
    expect(result.disposed).toMatchObject({ targets: 0, bytes: 0, materials: 0 });
    expect(result.released.destructions - result.after.destructions).toBe(4);
    expect(result.readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
    const inspect = await context.newPage();
    const differences = [];
    try {
      for (let index = 0; index < result.references.length; index++) {
        const diff = await imageDifference(
          inspect,
          result.references[index]!,
          result.actual[index]!,
        );
        expect(diff.reference).toEqual(index ? [24, 80] : [80, 24]);
        expect(diff.candidate).toEqual(diff.reference);
        expect(diff.maxByte).toBe(0);
        expect(diff.alphaMax).toBe(0);
        differences.push(diff);
        await writeFile(
          `${folder}/${result.backend}-${index}.png`,
          Buffer.from(result.actual[index]!.split(",")[1]!, "base64"),
        );
      }
      const coverage = await inspect.evaluate(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let partial = 0,
          colored = 0;
        for (let index = 0; index < data.length; index += 4) {
          if (data[index + 3]! > 0 && data[index + 3]! < 255) partial++;
          if (data[index]! !== data[index + 1]! && data[index + 3]! > 0) colored++;
        }
        return { partial, colored };
      }, result.actual[0]!);
      expect(coverage.partial).toBeGreaterThan(10);
      expect(coverage.colored).toBeGreaterThan(10);
      await writeFile(
        `${folder}/${result.backend}.json`,
        JSON.stringify(
          { ...result, references: undefined, actual: undefined, differences, coverage },
          null,
          2,
        ),
      );
    } finally {
      await inspect.close();
    }
  });
}
