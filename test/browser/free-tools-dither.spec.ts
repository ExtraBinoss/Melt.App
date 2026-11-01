import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

async function inspect(inspector: Page, dataUrl: string, inset = 0) {
  return inspector.evaluate(
    async ({ url, inset }) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(
        inset,
        inset,
        image.width - inset * 2,
        image.height - inset * 2,
      ).data;
      let colored = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i + 3] === 255 && (pixels[i] !== pixels[i + 1] || pixels[i] !== pixels[i + 2]))
          colored++;
      return { colored, width: image.width, height: image.height };
    },
    { url: dataUrl, inset },
  );
}

for (const forceWebGL of [false, true]) {
  test(`Dither source colors update the real preview and decoded image export (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
    context,
  }) => {
    test.setTimeout(60000);
    await page.addInitScript(() => localStorage.setItem("musart.language", "en"));
    if (forceWebGL)
      await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined }));
    await installReadbackProbe(page);
    const inspector = await context.newPage();
    const source = await inspector.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      const context = canvas.getContext("2d")!;
      for (const [index, color] of ["#ff0000", "#00ff00", "#0000ff", "#ffff00"].entries()) {
        context.fillStyle = color;
        context.fillRect(index * 16, 0, 16, 64);
      }
      return canvas.toDataURL("image/png");
    });
    try {
      await page.bringToFront();
      await page.goto("/tools/dither-converter");
      await expect(page.locator(".tool-converter")).toHaveAttribute("data-ready", "true");
      await page.locator("[data-tool-file]").setInputFiles({
        name: "source-colors.png",
        mimeType: "image/png",
        buffer: Buffer.from(source.split(",")[1]!, "base64"),
      });
      const download = page.getByRole("button", { name: "Download image", exact: true });
      await expect(download).toBeEnabled({ timeout: 30000 });
      const canvas = page.locator("canvas[data-tool-renderer]");
      await expect(canvas).toHaveAttribute("data-tool-renderer", forceWebGL ? "webgl" : "webgpu");
      // The sibling loader fades separately; inspect rendered content after its real exit.
      await expect(page.locator(".tool-loading")).toHaveCSS("opacity", "0");
      await mkdir("artifacts/tools", { recursive: true });
      const previewColors = async () => {
        // All controls now stay in flow. After Download scrolls the page, keep
        // the fixed public navbar outside the pixel-inspection rectangle.
        await page
          .locator(".tool-preview")
          .evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
        // The canvas extends behind its clipped frame; exclude the page below it.
        const screenshot = await page.locator(".tool-preview").screenshot({
          path: `artifacts/tools/dither-preview-${forceWebGL ? "webgl" : "webgpu"}.png`,
          animations: "disabled",
        });
        return (
          await inspect(inspector, `data:image/png;base64,${screenshot.toString("base64")}`, 24)
        ).colored;
      };
      // Exclude the rounded, tinted frame; decoded exports are inspected edge-to-edge below.
      expect(await previewColors()).toBe(0);
      const colors = page.getByRole("switch", { name: "Source colors", exact: true });
      await expect(colors).not.toBeChecked();
      await colors.click();
      await expect(colors).toBeChecked();
      await expect(page.getByRole("button", { name: "Ink color", exact: true })).toHaveCount(0);
      await expect.poll(previewColors).toBeGreaterThan(1000);
      const pending = page.waitForEvent("download");
      await download.click();
      await mkdir("artifacts/tools", { recursive: true });
      const path = `artifacts/tools/dither-source-${forceWebGL ? "webgl" : "webgpu"}.png`;
      await (await pending).saveAs(path);
      const output = `data:image/png;base64,${(await readFile(path)).toString("base64")}`;
      const actual = await inspect(inspector, output);
      expect(actual).toMatchObject({ width: 64, height: 64, colored: 4096 });
      await colors.click();
      await expect.poll(previewColors).toBe(0);
      expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
        gpu: 0,
        webgl: 0,
        canvas: 0,
        videoFrame: 0,
      });
    } finally {
      await inspector.close();
    }
  });
}
