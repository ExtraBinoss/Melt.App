import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installReadbackProbe } from "./support/readback-probe";
import type * as Witness from "./support/terminal-signal-witness";
import type {} from "../../apps/web/src/services/automation/automation";

test("Terminal Signal opens from the real gallery as an independent editable portrait project", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "en");
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installReadbackProbe(page);
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.getByRole("button", { name: "Project menu", exact: true }).click();
  await page.locator(".library-navigation-item").filter({ hasText: "Templates" }).first().click();
  await page.getByRole("searchbox").fill("Terminal Signal");
  const card = page.locator(".template-card-entry").filter({ hasText: "Terminal Signal" });
  await expect(card).toBeVisible();
  await card
    .locator(".motion-template-preview > img")
    .evaluate((node) => (node as HTMLImageElement).decode());
  await card.getByRole("button", { name: "Create from Terminal Signal", exact: true }).click();
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible({
    timeout: 20000,
  });
  const project = await page.evaluate(() => window.musart!.snapshot().project);
  expect(project.id).not.toBe("template-terminal-signal");
  expect(project.pages[0]).toMatchObject({
    width: 1080,
    height: 1920,
    motion: { mode: "motion", frameRate: { numerator: 60, denominator: 1 } },
  });
  await page.evaluate(() => {
    window.musart!.select(["terminal-copy"]);
    window.musart!.execute({
      type: "updateLayers",
      ids: ["terminal-copy"],
      patch: { text: "> YOUR OWN MESSAGE\n> MAKE IT MOVE" },
    });
  });
  expect(
    await page.evaluate(
      () =>
        window
          .musart!.snapshot()
          .project.pages[0]!.layers.find((layer) => layer.id === "terminal-copy")!.text,
    ),
  ).toContain("YOUR OWN MESSAGE");
  await page.evaluate(() => window.musart!.undo());
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(project);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
  });
  await page.screenshot({ path: "artifacts/terminal-signal/gallery-editor.png" });
});

for (const webgl of [false, true])
  test(`terminal cells, cursor, bounded 50-image effects and portrait template (${webgl ? "WebGL" : "WebGPU"})`, async ({
    page,
    context,
  }) => {
    test.setTimeout(90000);
    const output = `artifacts/terminal-signal/${webgl ? "webgl" : "webgpu"}`;
    await mkdir(output, { recursive: true });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installReadbackProbe(page);
    await page.route("**/__terminal-native", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body></body></html>",
      }),
    );
    await page.goto("/__terminal-native");
    const url = `/@fs${resolve("test/browser/support/terminal-signal-witness.ts")}`;
    const effect = await page.evaluate(
      async ({ url, webgl }) =>
        ((await import(url)) as typeof Witness).terminalEffectWitness(webgl),
      { url, webgl },
    );
    expect(effect.backend).toBe(webgl ? "webgl" : "webgpu");
    expect(effect.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
    expect(effect.loaded.materials).toBe(effect.warm.materials);
    expect(effect.loaded.targets).toBe(effect.warm.targets);
    expect(effect.loaded.bytes).toBe(effect.warm.bytes);
    expect(effect.loaded.passes - effect.warm.passes).toBe(50);
    expect(effect.disposed).toMatchObject({ targets: 0, bytes: 0, materials: 0 });
    await writeFile(
      `${output}/effect-gpu.json`,
      JSON.stringify(
        {
          warm: effect.warm,
          loaded: effect.loaded,
          disposed: effect.disposed,
          reads: effect.reads,
        },
        null,
        2,
      ),
    );
    const validator = await context.newPage();
    try {
      const metrics = await validator.evaluate(async (frames) => {
        const pixels = async (src: string) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(image, 0, 0);
          return ctx.getImageData(0, 0, image.width, image.height).data;
        };
        const data: Record<string, Uint8ClampedArray> = {};
        for (const [key, image] of Object.entries(frames)) {
          if (typeof image === "string" && image.startsWith("data:"))
            data[key] = await pixels(image);
        }
        const count = (name: string) =>
          Array.from(data[name]!).filter((value, index) => index % 4 === 3 && value > 127).length;
        const difference = (a: string, b: string) =>
          Math.max(...data[a]!.map((value, index) => Math.abs(value - data[b]![index]!)));
        return {
          empty: count("empty"),
          quarter: count("quarter"),
          cursor: count("cursor"),
          underline: count("underline"),
          line: count("line"),
          endpoint: difference("baseline", "full"),
          identity: difference("baseline", "identity"),
          repeat: difference("blinkOn", "repeated"),
          blinkOff: difference("quarter", "blinkOff"),
          top: data.quarter![(5 * 128 + 5) * 4 + 3],
          bottom: data.quarter![(58 * 128 + 5) * 4 + 3],
        };
      }, effect);
      expect(metrics).toMatchObject({
        empty: 0,
        quarter: 128 * 16,
        endpoint: 0,
        identity: 0,
        repeat: 0,
        blinkOff: 0,
        top: 255,
        bottom: 0,
      });
      expect(metrics.cursor - metrics.quarter).toBe(16 * 16);
      expect(metrics.underline - metrics.quarter).toBeGreaterThan(0);
      expect(metrics.underline).toBeLessThan(metrics.cursor);
      expect(metrics.line - metrics.quarter).toBe(128 * 16);
      await writeFile(`${output}/effect-metrics.json`, JSON.stringify(metrics, null, 2));
    } finally {
      await validator.close();
    }
    const template = await page.evaluate(
      async ({ url, webgl }) =>
        ((await import(url)) as typeof Witness).terminalTemplateWitness(webgl),
      { url, webgl },
    );
    if (!template.stats) throw new Error("Template renderer published no GPU statistics.");
    expect(template.stats.backend).toBe(webgl ? "webgl" : "webgpu");
    expect(template.stats.cacheBytes).toBeLessThan(128 * 1024 * 1024);
    expect(template.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
    expect(template.images[2]!.image).toBe(template.images[5]!.image);
    expect(new Set(template.images.map((frame) => frame.image)).size).toBe(5);
    for (const [index, frame] of template.images.entries())
      await writeFile(
        `${output}/frame-${index}.png`,
        Buffer.from(frame.image.split(",")[1]!, "base64"),
      );
    await writeFile(`${output}/stats.json`, JSON.stringify(template.stats, null, 2));
    expect(errors).toEqual([]);
  });
