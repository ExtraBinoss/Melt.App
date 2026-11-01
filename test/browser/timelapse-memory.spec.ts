import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installReadbackProbe } from "./support/readback-probe";

test("fifty large originals and a 4K effect plane render bounded native timelapse previews", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    const uploads: number[] = [];
    Object.assign(window, { timelapseUploads: uploads });
    const queue = globalThis.GPUQueue?.prototype;
    if (queue) {
      const original = queue.copyExternalImageToTexture;
      queue.copyExternalImageToTexture = function (source, destination, size) {
        const image = source.source;
        if (image instanceof ImageBitmap || image instanceof HTMLImageElement)
          uploads.push(image.width);
        return original.call(this, source, destination, size);
      };
    }
    for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      const original = prototype.texImage2D;
      Object.defineProperty(prototype, "texImage2D", {
        configurable: true,
        writable: true,
        value: new Proxy(original, {
          apply(target, receiver, args: unknown[]) {
            const image = args.at(-1);
            if (image instanceof ImageBitmap || image instanceof HTMLImageElement)
              uploads.push(image.width);
            return Reflect.apply(target, receiver, args);
          },
        }),
      });
    }
  });
  await mkdir("artifacts/timelapse-memory", { recursive: true });
  await writeFile(
    "artifacts/timelapse-memory/preview.html",
    `<!doctype html><html><body><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true; const { mountTimelapseMemoryWitness } = await import("/@fs${resolve("test/browser/support/timelapse-memory.tsx")}"); window.memoryWitness = mountTimelapseMemoryWitness();</script></body></html>`,
  );
  await page.goto(`/@fs${resolve("artifacts/timelapse-memory/preview.html")}`);
  const surface = page.locator('[data-status="ready"]');
  await expect(surface).toBeVisible({ timeout: 20000 });
  await expect(surface.locator("canvas")).toHaveAttribute("width", "480");
  await page.evaluate(() => Reflect.get(window, "memoryWitness").seek(1));
  await expect(page.locator('[data-history-time="1000"]')).toBeVisible();
  const uploads = await page.evaluate(() => Reflect.get(window, "timelapseUploads") as number[]);
  expect(uploads.length).toBeGreaterThanOrEqual(50);
  expect(Math.max(...uploads)).toBeLessThanOrEqual(480);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
  });
  expect(errors).toEqual([]);
  await surface.screenshot({ path: "artifacts/timelapse-memory/preview.png" });
  await page.evaluate(() => Reflect.get(window, "memoryWitness").release());
  await expect(page.locator("canvas")).toHaveCount(0);
});
