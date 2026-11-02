import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createLayer, createPage, createProject } from "@musart/core";
import { installPlayerAudioProbe, playerAudioEnergy } from "./support/player-audio-probe";
import { installReadbackProbe } from "./support/readback-probe";
let bundle: string;
test.beforeAll(async () => {
  await mkdir("artifacts/player", { recursive: true });
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/free-tools-video.ts",
      "--target=browser",
      "--outfile",
      "artifacts/player/video-witness.js",
    ],
    { stdio: "pipe" },
  );
  bundle = await readFile("artifacts/player/video-witness.js", "utf8");
});
async function init(page: Page) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await installPlayerAudioProbe(page);
  await installReadbackProbe(page);
}
async function volume(page: Page) {
  await page.evaluate(() => {
    const timing = { start: 0, first: 0, settled: 0 };
    Object.assign(window, { playerVolumeTiming: timing });
    const down = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(".media-player-volume-trigger")
      )
        return;
      document.removeEventListener("pointerdown", down, true);
      timing.start = event.timeStamp;
      const sample = () => {
        const panel = document.querySelector('.media-player-volume[data-state="open"]');
        const opacity = panel ? Number(getComputedStyle(panel).opacity) : 0;
        if (opacity > 0.01 && !timing.first) timing.first = performance.now() - timing.start;
        if (opacity > 0.99) timing.settled = performance.now() - timing.start;
        else if (performance.now() - timing.start < 1500) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    };
    document.addEventListener("pointerdown", down, true);
  });
  const control = page.locator('.media-player-volume [role="slider"]');
  await page.locator(".media-player").getByRole("button", { name: "Volume", exact: true }).click();
  const body = await page.locator("body").getAttribute("style");
  await control.focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 5; i++) await page.keyboard.press("PageUp");
  await expect(control).toHaveAttribute("aria-valuenow", "50");
  await expect.poll(async () => (await playerAudioEnergy(page)).rms).toBeGreaterThan(0.002);
  expect((await playerAudioEnergy(page)).states).toContain("running");
  expect(await page.locator("body").getAttribute("style")).toBe(body);
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  await expect.poll(async () => (await playerAudioEnergy(page)).rms).toBeLessThan(0.0001);
  await page.getByRole("button", { name: "Unmute", exact: true }).click();
  await expect(control).toHaveAttribute("aria-valuenow", "50");
  await expect.poll(async () => (await playerAudioEnergy(page)).rms).toBeGreaterThan(0.002);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { playerVolumeTiming: { settled: number } }).playerVolumeTiming
            .settled,
      ),
    )
    .toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(
    page.locator(".media-player").getByRole("button", { name: "Volume", exact: true }),
  ).toBeFocused();
  const timing = await page.evaluate(
    () =>
      (window as unknown as { playerVolumeTiming: { first: number; settled: number } })
        .playerVolumeTiming,
  );
  expect(timing.first).toBeGreaterThan(0);
  expect(timing.first).toBeLessThan(200);
  expect(timing.settled).toBeGreaterThan(0);
  expect(timing.settled).toBeLessThan(300);
  await test
    .info()
    .attach("volume-opening-ms", { body: JSON.stringify(timing), contentType: "application/json" });
}
test("tool player starts muted, seeks precisely, interpolates playback and monitors genuine audio", async ({
  page,
  context,
}) => {
  await init(page);
  const inspect = await context.newPage();
  await inspect.route("**/player-witness.html", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Fixture</title>" }),
  );
  await inspect.route("**/player-witness.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: bundle }),
  );
  await inspect.goto("/player-witness.html");
  const bytes = await inspect.evaluate(async () => {
    const path = "/player-witness.js";
    const module = (await import(
      /* @vite-ignore */ path
    )) as typeof import("./support/free-tools-video");
    return module.createToolVideo();
  });
  await inspect.close();
  await page.bringToFront();
  await page.goto("/tools/dither-converter");
  await expect(page.locator(".tool-converter")).toHaveAttribute("data-ready", "true");
  await page
    .locator("[data-tool-file]")
    .setInputFiles({ name: "motion.webm", mimeType: "video/webm", buffer: Buffer.from(bytes) });
  await expect(page.getByRole("button", { name: "Download video", exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await expect(page.locator("[data-player-time]")).toContainText(" / 0:02.0");
  expect((await playerAudioEnergy(page)).starts).toBe(0);
  await volume(page);
  await page.getByRole("button", { name: "Pause preview", exact: true }).click();
  await expect.poll(async () => (await playerAudioEnergy(page)).rms).toBeLessThan(0.0001);
  const seek = page.getByRole("slider", { name: "Preview time", exact: true });
  await seek.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(seek).toHaveAttribute("aria-valuenow", "0.001");
  await page.getByRole("button", { name: "Play preview", exact: true }).click();
  const points = await page.evaluate(async () => {
    const samples: {
      raw: string | undefined;
      x: number;
      mode: string | undefined;
      transition: string;
    }[] = [];
    for (let i = 0; i < 35; i++) {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      samples.push({
        raw: document.querySelector<HTMLElement>("[data-player-time]")!.dataset.time,
        mode: document.querySelector<HTMLElement>(".media-player")!.dataset.interpolate,
        transition: getComputedStyle(
          document.querySelector<HTMLElement>('.media-player-seek [data-slot="slider-thumb"]')!
            .parentElement!,
        ).transition,
        x: document
          .querySelector<HTMLElement>('.media-player-seek [data-slot="slider-thumb"]')!
          .getBoundingClientRect().x,
      });
    }
    return samples;
  });
  await writeFile("artifacts/player/interpolation.json", JSON.stringify(points));
  expect(
    points.some(
      (point, i) =>
        i > 0 && point.raw === points[i - 1]!.raw && Math.abs(point.x - points[i - 1]!.x) > 0.01,
    ),
  ).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  // The shared reduced-motion reset uses 0.01 ms so lifecycle transition events still fire.
  await expect
    .poll(() =>
      page
        .locator('.media-player-seek [data-slot="slider-thumb"]')
        .locator("..")
        .evaluate((node) =>
          Math.max(...getComputedStyle(node).transitionDuration.split(",").map(parseFloat)),
        ),
    )
    .toBeLessThanOrEqual(0.00001);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.screenshot({ path: "artifacts/player/tools.png" });
  await page.getByRole("link", { name: "Free tools", exact: true }).first().click();
  await expect
    .poll(async () => (await playerAudioEnergy(page)).states.every((s) => s === "closed"))
    .toBe(true);
});
function tone() {
  const rate = 48000,
    samples = rate * 5,
    buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    buffer.writeInt16LE(
      Math.round(Math.sin((i / rate) * 440 * Math.PI * 2) * 0.25 * 32767),
      44 + i * 2,
    );
  return buffer;
}
test("editor Export split action stays aligned and the shared export player monitors the frozen audio mix", async ({
  page,
}) => {
  await init(page);
  await page.goto("/editor/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const layer = createLayer("rectangle", {
    id: "player-shape",
    name: "Player",
    x: 10,
    y: 10,
    width: 100,
    height: 100,
    fill: "#8844ff",
  });
  const project = createProject({
    pages: [
      createPage({
        id: "player-page",
        width: 180,
        height: 180,
        layers: [layer],
        motion: {
          version: 2,
          mode: "motion",
          initialized: true,
          duration: { value: 5, rate: 1 },
          frameRate: { numerator: 30, denominator: 1 },
          tracks: [
            {
              id: "shape-track",
              layerId: layer.id,
              start: { value: 0, rate: 1 },
              end: null,
              properties: [],
            },
          ],
        },
      }),
    ],
  });
  await page.evaluate((p) => window.musart!.load(p), project);
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Add audio", exact: true }).click();
  await page
    .locator('input[type="file"][accept="audio/*"]')
    .setInputFiles({ name: "Tone.wav", mimeType: "audio/wav", buffer: tone() });
  await expect(page.locator(".motion-audio-row:not(.motion-canvas-active-overlay)")).toHaveCount(1);
  await page.evaluate(() => window.musart!.select([]));
  const before = await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project));
  const primary = page.locator(".inspector-header [data-inspector-export-trigger]");
  await expect(page.locator(".inspector-header .export-options")).toHaveCount(0);
  await primary.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".motion-export-preview-surface canvas")).toBeVisible();
  await expect(dialog.locator("[data-player-time]")).toContainText(" / 0:05.0");
  await volume(page);
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(before);
  await page.screenshot({ path: "artifacts/player/export.png" });
  await page.keyboard.press("Escape");
  await expect
    .poll(async () => (await playerAudioEnergy(page)).states.every((s) => s === "closed"))
    .toBe(true);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});

test("dock scroll fades reveal the same glass surface without a white overlay", async ({
  page,
}) => {
  await init(page);
  await page.goto("/editor/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.getByRole("button", { name: "Customize dock", exact: true }).click();
  const panel = page.locator(".dock-customizer");
  const fade = panel.locator(".dock-customizer-available");
  await expect(fade).toHaveAttribute("data-scroll-shadow-fade", "mask");
  await expect(fade).toHaveAttribute("data-overflow-bottom", "");
  const state = await panel.evaluate((element) => {
    const fade = element.querySelector(".dock-customizer-available")!;
    return {
      surface: getComputedStyle(element).backgroundColor,
      overlay: getComputedStyle(fade, "::after").display,
      mask: getComputedStyle(fade.firstElementChild!).maskImage,
    };
  });
  expect(state.overlay).toBe("none");
  expect(state.mask).toContain("linear-gradient");
  expect(state.surface).toContain("0.88");
  await page.screenshot({ path: "artifacts/player/dock-glass.png" });
});
