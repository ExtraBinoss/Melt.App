import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";

test("Export paints before GPU preparation and crossfades the shared mascot into real preview pixels", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      pages: [
        createPage({
          id: "export-loading",
          width: 180,
          height: 180,
          layers: [createLayer("rectangle", { width: 180, height: 180, fill: "#8844ff" })],
          motion: {
            version: 2,
            mode: "motion",
            initialized: true,
            duration: { value: 2, rate: 1 },
            frameRate: { numerator: 30, denominator: 1 },
            tracks: [],
          },
        }),
      ],
    }),
  );
  await expect(
    page.locator(
      '.canvas-artboard[data-artboard-id="export-loading"] canvas[data-renderer-ready="true"]',
    ),
  ).toBeVisible();
  const before = await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project));
  // Keep the genuine adapter and renderer; inject startup latency to exercise slow-device feedback.
  await page.evaluate(() => {
    if (!navigator.gpu) return;
    const request = navigator.gpu.requestAdapter.bind(navigator.gpu);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    Object.assign(window, { exportAdapterCalls: 0, releaseExportAdapter: release });
    navigator.gpu.requestAdapter = async (options) => {
      const state = window as unknown as { exportAdapterCalls: number };
      state.exportAdapterCalls++;
      await gate;
      return request(options);
    };
  });
  await page.locator(".inspector-header .export-trigger").click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Export composition", exact: true }),
  ).toBeVisible();
  const surface = dialog.locator(".motion-export-preview-surface");
  const loader = surface.locator(".export-preview-preparation");
  await expect(surface).toHaveAttribute("data-preview-ready", "false");
  await expect(
    loader.locator('.ui-throbber[data-visible="true"][data-variant="shimmer"]'),
  ).toBeVisible();
  await page.screenshot({ path: "artifacts/player/export-preparing.png" });
  const frames = await surface.evaluate(
    (root) =>
      new Promise<{ pixels: number; loader: number }[]>((resolve) => {
        const samples: { pixels: number; loader: number }[] = [];
        const observer = new MutationObserver(() => {
          if (root.getAttribute("data-preview-ready") !== "true") return;
          observer.disconnect();
          const start = performance.now();
          const sample = () => {
            samples.push({
              pixels: Number(
                getComputedStyle(root.querySelector(".export-preview-pixels")!).opacity,
              ),
              loader: Number(
                getComputedStyle(root.querySelector(".export-preview-preparation")!).opacity,
              ),
            });
            if (performance.now() - start < 300) requestAnimationFrame(sample);
            else resolve(samples);
          };
          sample();
        });
        observer.observe(root, { attributes: true, attributeFilter: ["data-preview-ready"] });
        (window as unknown as { releaseExportAdapter: () => void }).releaseExportAdapter();
      }),
  );
  expect(
    frames.some(
      (frame) => frame.pixels > 0 && frame.pixels < 1 && frame.loader > 0 && frame.loader < 1,
    ),
  ).toBe(true);
  await expect(surface.locator("canvas")).toBeVisible();
  await expect(surface.locator(".export-preview-pixels")).toHaveCSS("opacity", "1");
  await expect(loader).toBeHidden();
  for (const name of ["File format", "Resolution"]) {
    const trigger = dialog.getByRole("combobox", { name, exact: true });
    const field = (await trigger.boundingBox())!;
    await trigger.click();
    const menu = page.locator('[data-slot="select-content"]');
    await expect(menu).toBeVisible();
    const measures = await menu.evaluate(async (element) => {
      const samples = [];
      for (let i = 0; i < 10; i++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const rect = element.getBoundingClientRect();
        samples.push({ x: rect.x, width: rect.width });
      }
      return samples;
    });
    for (const measure of measures) {
      expect(Math.abs(measure.width - field.width)).toBeLessThan(1);
      expect(Math.abs(measure.x - field.x)).toBeLessThan(1);
    }
    await page.keyboard.press("Escape");
  }
  await dialog.getByRole("button", { name: "Pause preview", exact: true }).click();
  const seek = dialog.getByRole("slider", { name: "Preview time", exact: true });
  await seek.focus();
  await page.keyboard.press("Home");
  await expect(seek).toHaveAttribute("aria-valuenow", "0");
  const bounds = async () => {
    const track = (await dialog
      .locator('.media-player-seek [data-slot="slider-track"]')
      .boundingBox())!;
    const thumb = (await seek.boundingBox())!;
    return { start: track.x, end: track.x + track.width, thumb: thumb.x + thumb.width / 2 };
  };
  let geometry = await bounds();
  expect(Math.abs(geometry.thumb - geometry.start)).toBeLessThan(1);
  await page.keyboard.press("End");
  await expect(seek).toHaveAttribute("aria-valuenow", "2");
  geometry = await bounds();
  expect(Math.abs(geometry.thumb - geometry.end)).toBeLessThan(1);
  const time = dialog.getByRole("textbox", { name: "Start time", exact: true });
  await page.keyboard.press("ArrowLeft");
  await expect(seek).toHaveAttribute("aria-valuenow", "1.999");
  await time.click();
  await dialog
    .locator(".media-player")
    .screenshot({ path: "artifacts/player/time-field-focused.png", caret: "initial" });
  await dialog.getByRole("heading", { name: "Export composition", exact: true }).click();
  await expect(seek).toHaveAttribute("aria-valuenow", "1.999");
  await time.fill("0:01.25");
  await time.press("Enter");
  await expect(seek).toHaveAttribute("aria-valuenow", "1.25");
  await time.fill("0:00.5");
  await time.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(seek).toHaveAttribute("aria-valuenow", "1.25");
  await expect(dialog.getByRole("button", { name: "Volume", exact: true })).toBeDisabled();
  await dialog.locator(".media-player-no-audio").hover();
  await expect(page.getByRole("tooltip")).toHaveText("This artboard has no audio.");
  await dialog.getByRole("radio", { name: "Image", exact: true }).click();
  const image = dialog.locator(".export-preview-body img");
  await expect(image).toBeVisible();
  await expect(dialog.locator(".export-preview-body")).toHaveAttribute(
    "data-preview-ready",
    "true",
  );
  expect(await image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(
    0,
  );
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(before);
  await page.screenshot({ path: "artifacts/player/export-ready.png" });
  await dialog.getByRole("radio", { name: "Motion video", exact: true }).click();
  await expect(dialog.locator(".motion-export-preview-surface")).toHaveAttribute(
    "data-preview-ready",
    "true",
  );
  const footer = dialog.locator(".export-dialog-footer");
  const stable = (await footer.boundingBox())!;
  await expect(dialog.locator(".export-size-estimate")).toContainText("MB");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export video", exact: true }).click();
  await expect(dialog.getByRole("progressbar")).toBeVisible();
  const during = (await footer.boundingBox())!;
  expect(Math.abs(stable.y - during.y)).toBeLessThan(1);
  expect(Math.abs(stable.height - during.height)).toBeLessThan(1);
  await download;
  await expect(dialog.locator(".export-job")).toHaveAttribute("data-status", "complete");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.locator(".inspector-header .export-trigger").click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("progressbar")).toHaveCount(0);
  await expect(dialog.locator(".export-background-note")).toHaveCount(0);
  await expect(dialog.locator('[data-slot="dialog-description"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  // Once the native closing presence retires, no adapter work may be resurrected.
  const calls = await page.evaluate(
    () => (window as unknown as { exportAdapterCalls: number }).exportAdapterCalls,
  );
  await page.evaluate(async () => {
    for (let i = 0; i < 12; i++)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  expect(
    await page.evaluate(
      () => (window as unknown as { exportAdapterCalls: number }).exportAdapterCalls,
    ),
  ).toBe(calls);
});
