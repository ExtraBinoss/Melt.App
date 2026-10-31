import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

async function movingFrames(page: Page, phase: string) {
  const sample = await page.evaluate(async () => {
    const values: number[] = [],
      images = new Set<string>(),
      start = performance.now();
    let last = -200;
    while (performance.now() - start < 1000) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (performance.now() - start - last < 100) continue;
      last = performance.now() - start;
      values.push(
        Number(
          document.querySelector<HTMLOutputElement>(".tool-transport [data-player-time]")!.dataset
            .time,
        ),
      );
      // Native browser encoding is inspected only by this witness, never the effect pipeline.
      images.add(
        document.querySelector<HTMLCanvasElement>("canvas[data-tool-renderer]")!.toDataURL(),
      );
    }
    return { values, uniqueTimes: new Set(values).size, uniqueImages: images.size };
  });
  await mkdir("artifacts/tool-live", { recursive: true });
  await writeFile(
    `artifacts/tool-live/${process.env.MUSART_TOOL_COHORT ?? "candidate"}-${phase}.json`,
    JSON.stringify(sample, null, 2),
  );
  expect(
    sample.uniqueTimes,
    `${phase}: video clock must advance during control previews`,
  ).toBeGreaterThan(4);
  expect(sample.uniqueImages, `${phase}: genuine GPU frames must keep changing`).toBeGreaterThan(4);
}

test("video keeps rendering during numeric drafts and menu previews; advanced controls expand after basic controls", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("musart.language", "en"));
  await installReadbackProbe(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tools/dither-converter");
  await expect(page.locator(".tool-converter")).toHaveAttribute("data-ready", "true");
  await page
    .locator("[data-tool-file]")
    .setInputFiles("apps/web/public/templates/motion/media/flower.mp4");
  await expect(page.getByRole("button", { name: "Download video", exact: true })).toBeEnabled({
    timeout: 30000,
  });
  const profiler = await page.context().newCDPSession(page);
  await profiler.send("Profiler.enable");
  await profiler.send("Profiler.start");
  try {
    const contrast = page.getByRole("textbox", { name: "Contrast", exact: true });
    await contrast.fill("1.2");
    await movingFrames(page, "typing");
    await contrast.press("Escape");
    const scrub = contrast.locator("..").locator(".number-scrub");
    const handle = (await scrub.boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    const dragging = movingFrames(page, "drag");
    for (let i = 1; i <= 20; i++) {
      await page.mouse.move(handle.x + handle.width / 2 + i, handle.y + handle.height / 2);
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      );
    }
    await dragging;
    await page.mouse.up();
    const pattern = page.getByRole("combobox", { name: "Method", exact: true });
    await pattern.click();
    await page.getByRole("option", { name: "Interleaved gradient noise", exact: true }).hover();
    await movingFrames(page, "menu");
    await page.keyboard.press("Escape");
    const advanced = page.locator(".tool-advanced");
    const download = page.getByRole("button", { name: "Download video", exact: true });
    const before = {
      toggle: (await advanced.boundingBox())!,
      download: (await download.boundingBox())!,
      contrast: (await contrast.boundingBox())!,
    };
    expect(before.toggle.y).toBeGreaterThan(before.contrast.y + before.contrast.height);
    // The bundled flower clip contains an audio track, even when it sounds silent.
    await expect(page.locator('.tool-audio [role="switch"]')).toBeEnabled();
    const player = (await page.locator(".tool-transport").boundingBox())!,
      clipFields = (await page.locator(".tool-clip-fields").boundingBox())!;
    expect(Math.abs(player.x - clipFields.x)).toBeLessThan(1);
    expect(Math.abs(player.width - clipFields.width)).toBeLessThan(1);
    expect(
      await page.locator(".tool-transport").evaluate((node) => getComputedStyle(node).padding),
    ).toBe("0px");
    // Arm before native input: driver round trips can outlast this short animation.
    await advanced.evaluate((button) => {
      (
        window as unknown as { advancedFrames: Promise<{ y: number; height: number }[]> }
      ).advancedFrames = new Promise((resolve) => {
        button.addEventListener(
          "pointerdown",
          () => {
            const samples: { y: number; height: number }[] = [];
            const sample = () => {
              const node = document.querySelector(".tool-advanced-content");
              if (node) {
                const bounds = node.getBoundingClientRect();
                samples.push({ y: bounds.y, height: bounds.height });
              }
              if (samples.length >= 16) resolve(samples);
              else requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
          },
          { once: true },
        );
      });
    });
    await advanced.click();
    await expect(advanced).toHaveAttribute("aria-expanded", "true");
    const frames = await page.evaluate(
      () =>
        (window as unknown as { advancedFrames: Promise<{ y: number; height: number }[]> })
          .advancedFrames,
    );
    expect(new Set(frames.map((frame) => Math.round(frame.height))).size).toBeGreaterThan(3);
    expect(Math.abs((await advanced.boundingBox())!.y - before.toggle.y)).toBeLessThan(1);
    expect(Math.abs((await contrast.boundingBox())!.y - before.contrast.y)).toBeLessThan(1);
    expect((await download.boundingBox())!.y).toBeGreaterThan(before.download.y + 100);
    await page.screenshot({ path: "artifacts/tool-live/controls.png" });
    await advanced.click();
    await expect
      .poll(async () => Math.abs((await download.boundingBox())!.y - before.download.y))
      .toBeLessThan(1);
    expect(Math.abs((await advanced.boundingBox())!.y - before.toggle.y)).toBeLessThan(1);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await advanced.focus();
    await page.keyboard.press("Enter");
    await expect(advanced).toHaveAttribute("aria-expanded", "true");
    expect(
      await page
        .locator(".tool-advanced-content")
        .evaluate((node) => getComputedStyle(node).animationName),
    ).toBe("none");
    await page.keyboard.press("Enter");
    await expect(advanced).toHaveAttribute("aria-expanded", "false");
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
      videoFrame: 0,
    });
    expect(errors).toEqual([]);
  } finally {
    const { profile } = await profiler.send("Profiler.stop");
    await mkdir("artifacts/tool-live", { recursive: true });
    await writeFile(
      `artifacts/tool-live/${process.env.MUSART_TOOL_COHORT ?? "candidate"}-cpu.json`,
      JSON.stringify(profile),
    );
    await profiler.detach();
  }
});
