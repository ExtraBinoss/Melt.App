import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installReadbackProbe } from "./support/readback-probe";
import { installNativeVideoProbe } from "./support/native-video-probe";
let bundle: string;
test.beforeAll(async () => {
  await mkdir("artifacts/tools", { recursive: true });
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/free-tools-video.ts",
      "--target=browser",
      "--outfile",
      "artifacts/tools/video-witness.js",
    ],
    { stdio: "pipe" },
  );
  bundle = await readFile("artifacts/tools/video-witness.js", "utf8");
});
test("ASCII and dither video tools export real moving frames, trims and source audio with bounded native resources", async ({
  page,
  context,
}) => {
  test.setTimeout(150000);
  await page.addInitScript(() => localStorage.setItem("musart.language", "en"));
  await installReadbackProbe(page);
  await installNativeVideoProbe(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const inspection = await context.newPage();
  await inspection.route("**/tool-witness.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Tool output inspection</title>",
    }),
  );
  await inspection.route("**/tool-witness.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: bundle }),
  );
  await inspection.goto("/tool-witness.html");
  const fixture = await inspection.evaluate(async () => {
    const url = "/tool-witness.js";
    const witness = (await import(
      /* @vite-ignore */ url
    )) as typeof import("./support/free-tools-video");
    return witness.createToolVideo();
  });
  console.log("Native video fixture encoded");
  await page.bringToFront();
  for (const style of ["ascii", "dither"]) {
    await page.goto(`/tools/${style}-video-converter`);
    await expect(page.locator(".tool-converter")).toHaveAttribute("data-ready", "true");
    await page
      .locator("[data-tool-file]")
      .setInputFiles({ name: "moving.webm", mimeType: "video/webm", buffer: Buffer.from(fixture) });
    const download = page.getByRole("button", { name: "Download video", exact: true });
    await expect(download).toBeEnabled({ timeout: 30000 });
    console.log(`${style} first frame ready`);
    await expect(page.locator("canvas[data-tool-renderer]")).toBeVisible();
    await page.getByRole("button", { name: "Pause preview", exact: true }).click();
    const fields = page.locator(".tool-clip-fields input");
    await fields.nth(1).fill("1");
    await fields.nth(1).press("Enter");
    await fields.nth(0).fill("0.5");
    await fields.nth(0).press("Enter");
    if (style === "dither") await page.locator('.tool-audio [role="switch"]').click();
    await page.getByRole("combobox", { name: "Download format", exact: true }).click();
    await page.getByRole("option", { name: "WebM", exact: true }).click();
    const pending = page.waitForEvent("download");
    await download.click();
    const exported = await pending;
    const output = resolve(`artifacts/tools/${style}-clip.webm`);
    await exported.saveAs(output);
    console.log(`${style} downloaded`);
    const readbacks = await page.evaluate(() => window.__musartVideoReadbacks);
    expect(readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
    const bytes = [...(await readFile(output))];
    await inspection.bringToFront();
    const decoded = await inspection.evaluate(async (bytes) => {
      const url = "/tool-witness.js";
      const witness = (await import(
        /* @vite-ignore */ url
      )) as typeof import("./support/free-tools-video");
      return witness.inspectToolVideo(bytes);
    }, bytes);
    await writeFile(
      resolve(`artifacts/tools/${style}-clip.json`),
      JSON.stringify({ decoded, readbacks }, null, 2),
    );
    expect(decoded).toMatchObject({ width: 160, height: 120, audio: style === "ascii" });
    expect(decoded.duration).toBeCloseTo(1, 1);
    expect(decoded.timestamps).toHaveLength(30);
    expect(decoded.uniqueFrames).toBeGreaterThan(8);
    if (style === "ascii") expect(decoded.rms).toBeGreaterThan(0.05);
    await page.bringToFront();
    await page.locator(".tool-canvas-host").evaluate((node) => {
      node.style.display = "none";
    });
    // Switching to a new local source must close the old frame leases/decoder before it is ready.
    if (style === "ascii") {
      await page
        .locator("[data-tool-file]")
        .setInputFiles(resolve("apps/web/public/benchmark/06-boathouse-1.jpg"));
      await expect(page.getByRole("button", { name: "Download image", exact: true })).toBeEnabled({
        timeout: 30000,
      });
    }
    await page.locator("[data-tool-file]").setInputFiles({
      name: "replacement.webm",
      mimeType: "video/webm",
      buffer: Buffer.from(fixture),
    });
    await page.locator(".tool-canvas-host").evaluate((node) => {
      node.style.display = "";
    });
    await expect(page.locator(".tool-file-name")).toHaveText("replacement.webm");
    await expect(download).toBeEnabled();
    const native = await page.evaluate(
      () =>
        (
          window as unknown as {
            __musartNativeVideo: {
              duplicateCloses: number;
              framesOpen: number;
              decodersOpen: number;
            };
          }
        ).__musartNativeVideo,
    );
    expect(native.duplicateCloses).toBe(0);
    expect(native.decodersOpen).toBeLessThanOrEqual(1);
    expect(native.framesOpen).toBeLessThan(12);
  }
  expect(errors).toEqual([]);
  await inspection.close();
});
