import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createEffect, createLayer } from "@musart/core";
import { inspectImage } from "./support/image-probe";
import { installReadbackProbe } from "./support/readback-probe";

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket("**", () => {});
});

const surfaces = [
  ".musart-app",
  ".inspector",
  ".canvas-area",
  ".editor-canvas",
  ".editor-gpu-scene",
];
interface DragSample {
  input: number;
  dispatch: number;
  presented: number;
  secondRaf: number;
}
declare global {
  interface Window {
    __effectDrag?: { samples: DragSample[]; pending: number; stop(): void };
  }
}
async function presented(page: Page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas");
    return (
      canvas?.dataset.rendererReady === "true" &&
      canvas.dataset.sceneRevision === canvas.dataset.renderedRevision
    );
  });
}
async function counters(page: Page) {
  return page.evaluate((surfaces) => {
    const canvas = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")!;
    return {
      react: Object.fromEntries(
        surfaces.map((selector) => {
          const count = Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders);
          if (!Number.isInteger(count) || count < 1)
            throw Error(`Missing React counter ${selector}`);
          return [selector, count];
        }),
      ),
      gpu: JSON.parse(canvas.dataset.gpuStats!) as Record<string, number>,
      instances: canvas.dataset.rendererInstances,
      backend: canvas.dataset.backend,
    };
  }, surfaces);
}

test("50-image multi-effect artwork drag retains treatment pixels while its world mask moves", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem(
      "musart.snapping.v1",
      JSON.stringify({ version: 1, enabled: false, threshold: 6 }),
    );
  });
  await page.goto("/editor?benchmark=50&automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const effects = [
    createEffect("blur", { amount: 0.6 }),
    createEffect("brightness", { amount: 0.7 }),
    createEffect("grain", { amount: 0.35, seed: 17 }),
  ];
  const mask = createLayer("ellipse", {
    id: "drag-fixed-mask",
    x: 700,
    y: 450,
    width: 800,
    height: 520,
    maskSource: true,
  });
  const id = await page.evaluate(
    ({ effects, mask }) => {
      const project = window.musart!.snapshot().project,
        page = project.pages[0]!;
      const image = page.layers.find((layer) => layer.kind === "image")!;
      image.parentId = null;
      image.x = 700;
      image.y = 450;
      image.width = 800;
      image.height = 520;
      image.rotation = 0;
      image.blendMode = "normal";
      image.opacity = 1;
      image.effects = effects;
      image.mask = { layerId: mask.id, enabled: true, inverted: false };
      page.layers = [...page.layers.filter((layer) => layer !== image), image, mask];
      window.musart!.load(project);
      window.musart!.select([image.id]);
      return image.id;
    },
    { effects, mask },
  );
  await page.getByRole("button", { name: "Rechercher dans Melt", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Rechercher dans Melt", exact: true })
    .fill("ajuster écran");
  await page.getByRole("option", { name: /Ajuster à l’écran/ }).click();
  await expect(page.getByTestId("artboard")).toHaveAttribute("data-view-moving", "false");
  await presented(page);
  await page.evaluate(() => window.musart!.flushThumbnails());
  const inspector = await page.context().newPage();
  await page.bringToFront();
  const canvas = page.locator(".canvas-artboard canvas");
  const region = { x: 700 / 2400, y: 450 / 1500, width: 800 / 2400, height: 520 / 1500 };
  const hash = async () =>
    (await inspectImage(page, await canvas.screenshot(), [region], inspector)).regions[0]!.hash;
  try {
    const initial = await page.evaluate(() => window.musart!.snapshot());
    expect(initial.project.pages[0]!.layers.filter((layer) => layer.kind === "image")).toHaveLength(
      50,
    );
    const baselineHash = await hash();
    const before = await counters(page);
    expect(Number.isFinite(before.gpu.effectPasses)).toBe(true);
    const board = (await page.getByTestId("artboard").boundingBox())!,
      zoom = board.width / 2400;
    const start = { x: board.x + 1100 * zoom, y: board.y + 710 * zoom };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")!;
      const state = { samples: [] as DragSample[], pending: 0, stop: () => {} };
      const move = (event: PointerEvent) => {
        if (!(event.buttons & 1)) return;
        const input = event.timeStamp,
          dispatch = performance.now();
        state.pending++;
        queueMicrotask(() => {
          const revision = Number(canvas.dataset.sceneRevision);
          const poll = () => {
            if (Number(canvas.dataset.renderedRevision) < revision) {
              requestAnimationFrame(poll);
              return;
            }
            const presented = performance.now();
            requestAnimationFrame(() => {
              state.samples.push({ input, dispatch, presented, secondRaf: performance.now() });
              state.pending--;
            });
          };
          requestAnimationFrame(poll);
        });
      };
      window.addEventListener("pointermove", move);
      state.stop = () => window.removeEventListener("pointermove", move);
      window.__effectDrag = state;
    });
    const profiler =
      process.env.MUSART_EFFECT_DRAG_PROFILE === "1"
        ? await page.context().newCDPSession(page)
        : null;
    if (profiler) {
      await profiler.send("Profiler.enable");
      await profiler.send("Profiler.start");
    }
    // Native held-pointer packets run without waiting for each render. This exercises
    // coalescing/backpressure instead of serializing the workload behind GPU readiness.
    await page.mouse.move(start.x + 160 * zoom, start.y + 60 * zoom, { steps: 24 });
    await presented(page);
    await page.waitForFunction(() => window.__effectDrag?.pending === 0);
    if (profiler) {
      const { profile } = await profiler.send("Profiler.stop");
      await writeFile(testInfo.outputPath("effect-drag.cpuprofile"), JSON.stringify(profile));
      await profiler.detach();
    }
    const samples = await page.evaluate(() => {
      window.__effectDrag!.stop();
      return window.__effectDrag!.samples;
    });
    const during = await counters(page),
      previewHash = await hash();
    expect(during.react).toEqual(before.react);
    expect(during.instances).toBe(before.instances);
    expect(during.gpu.uploads).toBe(before.gpu.uploads);
    expect(during.gpu.effectPasses).toBe(before.gpu.effectPasses);
    expect(during.gpu.cacheBytes).toBeLessThanOrEqual(during.gpu.maxBytes!);
    expect(previewHash).not.toBe(baselineHash);
    expect((await page.evaluate(() => window.musart!.snapshot())).revision).toBe(initial.revision);
    await page.mouse.up();
    await presented(page);
    const committed = await page.evaluate(() => window.musart!.snapshot());
    expect(committed.revision).toBe(initial.revision + 1);
    const moved = committed.project.pages[0]!.layers.find((layer) => layer.id === id)!;
    expect(moved.x).toBeCloseTo(860, 0);
    expect(moved.y).toBeCloseTo(510, 0);
    expect(await hash()).toBe(previewHash);
    await page.evaluate(() => window.musart!.undo());
    await presented(page);
    expect(await hash()).toBe(baselineHash);
    expect((await page.evaluate(() => window.musart!.snapshot())).canUndo).toBe(false);
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
    const latency = samples.map((sample) => sample.secondRaf - sample.input).sort((a, b) => a - b);
    const p95 = latency[Math.floor((latency.length - 1) * 0.95)]!;
    const environment = await page.evaluate(async () => {
      const adapter = await navigator.gpu?.requestAdapter();
      return {
        userAgent: navigator.userAgent,
        dpr: devicePixelRatio,
        viewport: [innerWidth, innerHeight],
        adapter: adapter
          ? {
              vendor: adapter.info.vendor,
              architecture: adapter.info.architecture,
              device: adapter.info.device,
              description: adapter.info.description,
              isFallbackAdapter: adapter.info.isFallbackAdapter,
            }
          : null,
      };
    });
    const report = JSON.stringify(
      {
        before,
        during,
        samples,
        p95,
        environment,
        platform: process.platform,
        browser: page.context().browser()?.version(),
      },
      null,
      2,
    );
    await writeFile(testInfo.outputPath("effect-object-drag.json"), report);
    await testInfo.attach("effect-object-drag", {
      body: report,
      contentType: "application/json",
    });
    expect(samples.length).toBeGreaterThanOrEqual(12);
    expect(p95).toBeLessThanOrEqual(100);
  } finally {
    await page.mouse.up();
    await page.evaluate(() => window.__effectDrag?.stop());
    await inspector.close();
  }
});
