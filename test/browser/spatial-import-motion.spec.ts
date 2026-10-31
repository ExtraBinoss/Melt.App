import { expect, test } from "@playwright/test";
import { createPage, createProject } from "@musart/core";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spatialGlb, spatialHdr } from "./support/spatial-glb";
import { installReadbackProbe } from "./support/readback-probe";
let bundle: string, worker: string, environmentWorker: string;
test.beforeAll(async () => {
  await mkdir("artifacts/spatial", { recursive: true });
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/spatial-motion-witness.ts",
      "--target=browser",
      "--external=*?url",
      "--outfile=artifacts/spatial/motion-witness.js",
    ],
    { stdio: "pipe" },
  );
  execFileSync(
    "bun",
    [
      "build",
      "packages/render/src/spatial/geometry.worker.ts",
      "--target=browser",
      "--outfile=artifacts/spatial/geometry-worker.js",
    ],
    { stdio: "pipe" },
  );
  execFileSync(
    "bun",
    [
      "build",
      "packages/render/src/spatial/environment.worker.ts",
      "--target=browser",
      "--outfile=artifacts/spatial/environment-worker.js",
    ],
    { stdio: "pipe" },
  );
  environmentWorker = await readFile("artifacts/spatial/environment-worker.js", "utf8");
  bundle = await readFile("artifacts/spatial/motion-witness.js", "utf8");
  worker = await readFile("artifacts/spatial/geometry-worker.js", "utf8");
});
test("GLB import exposes its real clip and native Motion exports decode changing geometry", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.log("spatial-error", error.message);
  });
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({ pages: [createPage({ id: "import-scene", width: 128, height: 128 })] }),
  );
  await page.locator(".toolbar").getByRole("button", { name: "3D", exact: true }).click();
  await page.locator(".spatial-library input[type=file]").setInputFiles({
    name: "tetrahedron.glb",
    mimeType: "model/gltf-binary",
    buffer: Buffer.from(spatialGlb()),
  });
  await expect(
    page.locator(".inspector [data-slot=select-trigger]").filter({ hasText: "None" }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("combobox", { name: "Animation clip" }).click();
  await page.getByRole("option", { name: "Quarter turn" }).click();
  await page.locator(".inspector input[type=file]").setInputFiles({
    name: "studio.hdr",
    mimeType: "image/vnd.radiance",
    buffer: Buffer.from(spatialHdr()),
  });
  await page.waitForFunction(
    () => Boolean(window.musart!.snapshot().project.pages[0]!.spatial?.environment.assetId),
    null,
    { timeout: 15000 },
  );
  const project = await page.evaluate(() => window.musart!.snapshot().project);
  const environment = project.assets[project.pages[0]!.spatial!.environment.assetId!]!;
  expect(environment).toMatchObject({ kind: "environment", width: 1024, height: 512 });
  expect(project.pages[0]!.layers[0]!.spatial).toMatchObject({ source: "glb", clip: 0 });
  const canvas = page.locator(".editor-gpu-scene canvas");
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true", { timeout: 30000 });
  await page.screenshot({ path: "artifacts/spatial/imported-glb.png" });
  await context.route("**/spatial-witness.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><title>Native 3D export witness</title><script type="importmap">{"imports":{"harfbuzzjs/hb.wasm?url":"/spatial-font-url.js"}}</script>',
    }),
  );
  await context.route("**/assets/profiles/CRPC6-perceptual-rgb8.bin?url", (route) =>
    route.fulfill({ contentType: "text/javascript", body: 'export default "/spatial-proof.bin";' }),
  );
  await context.route("**/spatial-font-url.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: 'export default "/spatial-font.wasm";' }),
  );
  await context.route("**/spatial-motion-witness.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: bundle }),
  );
  await context.route("**/geometry.worker.ts", (route) =>
    route.fulfill({ contentType: "text/javascript", body: worker }),
  );
  await context.route("**/environment.worker.ts", (route) =>
    route.fulfill({ contentType: "text/javascript", body: environmentWorker }),
  );
  const witness = await context.newPage();
  try {
    await installReadbackProbe(witness);
    await witness.goto("/spatial-witness.html");
    const result = await witness.evaluate(async (project) => {
      const url = "/spatial-motion-witness.js";
      const module = (await import(
        /* @vite-ignore */ url
      )) as typeof import("./support/spatial-motion-witness");
      return module.renderSpatialMotion(project);
    }, project);
    expect(result).toMatchObject({ frames: 6, width: 128, height: 128, unchanged: true });
    expect(result.progress.at(-1)).toBe(1);
    expect(await witness.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
    await writeFile(
      "artifacts/spatial/glb-motion.mp4",
      Buffer.from(result.encoded.split(",")[1]!, "base64"),
    );
    const inspection = await context.newPage();
    try {
      await inspection.goto("/spatial-witness.html");
      const decoded = await inspection.evaluate(async (encoded) => {
        const url = "/spatial-motion-witness.js";
        return (
          (await import(
            /* @vite-ignore */ url
          )) as typeof import("./support/spatial-motion-witness")
        ).inspectSpatialMotion(encoded);
      }, result.encoded);
      expect(decoded).toMatchObject({ width: 128, height: 128, frames: 6 });
      expect(decoded.colored).toBeGreaterThan(100);
      expect(decoded.changed).toBeGreaterThan(50);
    } finally {
      await inspection.close();
    }
  } finally {
    await witness.close();
  }
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  expect(errors).toEqual([]);
});
