import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

test("native paint streams visibly present intermediate SV, hue and alpha frames before release", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    const probe = { held: false, lastInput: 0, frames: [] as { revision: number; at: number }[] };
    Object.assign(window, { __livePaint: probe });
    window.addEventListener(
      "pointerdown",
      (event) => {
        if ((event.target as Element).closest(".color-channels")) {
          probe.held = true;
          probe.frames = [];
        }
      },
      true,
    );
    window.addEventListener(
      "pointermove",
      () => {
        if (probe.held) probe.lastInput = performance.now();
      },
      true,
    );
    window.addEventListener(
      "pointerup",
      () => {
        probe.held = false;
      },
      true,
    );
    new MutationObserver((changes) => {
      if (!probe.held) return;
      for (const change of changes) {
        const target = change.target as HTMLElement;
        if (target.matches(".canvas-artboard canvas"))
          probe.frames.push({
            revision: Number(target.dataset.renderedRevision),
            at: performance.now(),
          });
      }
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-rendered-revision"],
    });
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLElement>(".canvas-artboard canvas")?.dataset.rendererReady ===
      "true",
  );
  await page.evaluate(() => window.musart!.flushThumbnails());
  const native = await page.context().newCDPSession(page);
  const evidence = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const state = () =>
    page.evaluate(() => ({
      revision: window.musart!.snapshot().revision,
      background: window.musart!.snapshot().project.pages[0]!.background,
      commits: [
        ".musart-app",
        ".inspector",
        ".canvas-area",
        ".editor-canvas",
        ".editor-gpu-scene",
      ].map((selector) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element?.dataset.reactRenders) throw new Error(`Missing React counter ${selector}`);
        return Number(element.dataset.reactRenders);
      }),
    }));
  for (const channel of ["sv", "hue", "alpha"] as const) {
    const field = page
      .locator(
        channel === "sv" ? ".color-sv-pad .react-colorful__interactive" : `.color-${channel}`,
      )
      .first();
    const thumb =
      channel === "sv"
        ? field.locator(".react-colorful__saturation-pointer")
        : field.locator('[data-slot="slider-thumb"]').locator("..");
    await expect(thumb).toHaveCSS("transition-duration", "0s");
    const box = (await field.boundingBox())!;
    const before = await state();
    const x = (fraction: number) => box.x + box.width * fraction;
    const y = (fraction: number) => box.y + box.height * fraction;
    await native.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: x(0.25),
      y: y(0.2),
      button: "none",
      buttons: 0,
    });
    await native.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: x(0.25),
      y: y(0.2),
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    for (let index = 0; index < 18; index++)
      await native.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: x(channel === "sv" ? 0.2 + index * 0.035 : 0.5),
        y: y(0.2 + index * 0.03),
        button: "left",
        buttons: 1,
      });
    const during = await state();
    const probe = await page.evaluate(
      () =>
        Reflect.get(window, "__livePaint") as {
          frames: { revision: number; at: number }[];
          lastInput: number;
        },
    );
    const streamed = probe.frames.filter((frame) => frame.at <= probe.lastInput);
    expect(new Set(streamed.map((frame) => frame.revision)).size).toBeGreaterThan(1);
    expect(during.revision).toBe(before.revision);
    expect(during.background).toBe(before.background);
    expect(during.commits).toEqual(before.commits);
    await native.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: x(channel === "sv" ? 0.795 : 0.5),
      y: y(0.71),
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    await expect.poll(async () => (await state()).revision).toBe(before.revision + 1);
    await page.evaluate(() => window.musart!.undo());
    expect((await state()).background).toBe(before.background);
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>(".canvas-artboard canvas")?.dataset.rendererReady ===
        "true",
    );
    evidence.push({ channel, before, during, streamed });
  }
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  expect(errors).toEqual([]);
  await mkdir("artifacts/background-color-performance", { recursive: true });
  await writeFile(
    "artifacts/background-color-performance/live-presentation.json",
    JSON.stringify(
      { browser: page.context().browser()!.version(), evidence, reads, errors },
      null,
      2,
    ),
  );
  await native.detach();
});
