import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

const surfaces = [
  ".musart-app",
  ".inspector",
  ".canvas-area",
  ".editor-canvas",
  ".editor-gpu-scene",
];

test("composition background native drags retain one geometry sample and one undo entry", async ({
  page,
}) => {
  const output =
    process.env.MUSART_COLOR_REPORT ?? "artifacts/background-color-performance/native.json";
  await mkdir("artifacts/background-color-performance", { recursive: true });
  await installReadbackProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "en"));
  await page.addInitScript(() => {
    const records: {
      type: string;
      generated: number;
      dispatch: number;
      first?: number;
      second?: number;
    }[] = [];
    const reads: { target: string; duration: number; phase: string }[] = [];
    const state = { records, reads, active: false, held: false, phase: "idle" };
    Object.assign(window, { __backgroundColorProbe: state });
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      const started = performance.now();
      const box = original.call(this);
      if (state.active)
        reads.push({
          target: this.className.toString(),
          duration: performance.now() - started,
          phase: state.phase,
        });
      return box;
    };
    for (const type of ["pointerdown", "pointermove", "pointerup"])
      window.addEventListener(
        type,
        (event) => {
          const e = event as PointerEvent;
          if (!state.active) return;
          if (type === "pointerdown")
            state.held = Boolean((e.target as Element).closest(".color-control"));
          if (!state.held || (type === "pointermove" && !e.buttons)) return;
          if (type === "pointerup") state.held = false;
          state.phase = type;
          const row = {
            type,
            generated: e.timeStamp,
            dispatch: performance.now(),
            first: undefined as number | undefined,
            second: undefined as number | undefined,
          };
          records.push(row);
          const canvas = document.querySelector<HTMLElement>(".canvas-artboard canvas")!;
          const before = canvas.dataset.renderCount;
          const wait = () => {
            if (canvas.dataset.renderCount === before && type !== "pointerup") {
              if (performance.now() - row.dispatch < 2000) requestAnimationFrame(wait);
              return;
            }
            row.first = performance.now();
            requestAnimationFrame(() => {
              row.second = performance.now();
            });
          };
          requestAnimationFrame(wait);
        },
        true,
      );
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const original = "#f1eee7";
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      id: "background-color-native",
      pages: [
        createPage({
          id: "background-page",
          width: 1200,
          height: 900,
          background: original,
          layers: Array.from({ length: 30 }, (_, index) =>
            createLayer("rectangle", {
              id: `background-object-${index}`,
              x: 30 + (index % 10) * 65,
              y: 30 + Math.floor(index / 10) * 65,
              width: 45,
              height: 45,
              fill: "#6677cc",
              radius: 4,
            }),
          ),
        }),
      ],
    }),
  );
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Background", exact: true })).toBeVisible();
  await page.evaluate(() => window.musart!.flushThumbnails());
  const native = await page.context().newCDPSession(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  const initial = await page.evaluate(
    (selectors) => ({
      revision: window.musart!.snapshot().revision,
      commits: selectors.map((selector) => {
        const node = document.querySelector<HTMLElement>(selector);
        if (!node?.dataset.reactRenders) throw new Error(`Missing React counter ${selector}`);
        return Number(node.dataset.reactRenders);
      }),
    }),
    surfaces,
  );
  const openings: {
    generated: number;
    dispatch: number;
    first: number;
    second: number;
  }[] = [];
  for (let index = 0; index < 3; index++) {
    await page.evaluate(() => window.musart!.select(["background-object-0"]));
    await expect(page.getByRole("heading", { name: "Background", exact: true })).toHaveCount(0);
    const canvas = (await page.locator(".canvas-artboard canvas").boundingBox())!;
    await page.evaluate(() => {
      Object.assign(window, { __backgroundOpening: null });
      window.addEventListener(
        "pointerdown",
        (event) => {
          const generated = event.timeStamp,
            dispatch = performance.now();
          const wait = () => {
            if (
              !Array.from(document.querySelectorAll(".inspector h3")).some(
                (node) => node.textContent === "Background",
              )
            ) {
              requestAnimationFrame(wait);
              return;
            }
            const first = performance.now();
            requestAnimationFrame(() =>
              Object.assign(window, {
                __backgroundOpening: {
                  generated,
                  dispatch,
                  first,
                  second: performance.now(),
                },
              }),
            );
          };
          requestAnimationFrame(wait);
        },
        { capture: true, once: true },
      );
    });
    const position = {
      x: canvas.x + canvas.width * 0.8,
      y: canvas.y + canvas.height * 0.8,
    };
    await native.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...position,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await native.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      ...position,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    await page.waitForFunction(() => Boolean(Reflect.get(window, "__backgroundOpening")));
    openings.push(await page.evaluate(() => Reflect.get(window, "__backgroundOpening")));
  }
  const dragInitial = await page.evaluate(
    (selectors) => ({
      revision: window.musart!.snapshot().revision,
      commits: selectors.map((selector) =>
        Number(document.querySelector<HTMLElement>(selector)!.dataset.reactRenders),
      ),
    }),
    surfaces,
  );
  const pad = page.locator(".color-sv-pad .react-colorful__interactive").first();
  const box = (await pad.boundingBox())!;
  const start = { x: box.x + box.width * 0.1, y: box.y + box.height * 0.2 };
  await native.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    ...start,
    button: "none",
    buttons: 0,
  });
  await page.evaluate(() => {
    Reflect.get(window, "__backgroundColorProbe").active = true;
  });
  await native.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...start,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  for (let index = 1; index <= 24; index++) {
    await native.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: box.x + box.width * (0.1 + index * 0.03),
      y: box.y + box.height * (0.2 + index * 0.02),
      button: "left",
      buttons: 1,
    });
  }
  const during = await page.evaluate(
    (selectors) => ({
      revision: window.musart!.snapshot().revision,
      background: window.musart!.snapshot().project.pages[0]!.background,
      commits: selectors.map((selector) =>
        Number(document.querySelector<HTMLElement>(selector)!.dataset.reactRenders),
      ),
      stats: document.querySelector<HTMLElement>(".canvas-artboard canvas")!.dataset.gpuStats,
    }),
    surfaces,
  );
  expect(during.revision).toBe(dragInitial.revision);
  expect(during.background).toBe(original);
  expect(during.commits).toEqual(dragInitial.commits);
  await native.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: box.x + box.width * 0.82,
    y: box.y + box.height * 0.68,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().revision))
    .toBe(dragInitial.revision + 1);
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
  const probe = await page.evaluate(() => {
    const state = Reflect.get(window, "__backgroundColorProbe");
    state.active = false;
    return state;
  });
  const committed = await page.evaluate(
    () => window.musart!.snapshot().project.pages[0]!.background,
  );
  expect(committed).not.toBe(original);
  await page.waitForFunction(() => {
    const data = document.querySelector<HTMLElement>(".canvas-artboard canvas")!.dataset;
    return data.sceneRevision === data.renderedRevision;
  });
  const screenshot = await page.locator(".canvas-artboard canvas").screenshot();
  const inspection = await page.context().newPage();
  const pixel = await inspection.evaluate(
    async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return Array.from(
        context.getImageData(Math.floor(canvas.width * 0.8), Math.floor(canvas.height * 0.8), 1, 1)
          .data,
      );
    },
    `data:image/png;base64,${screenshot.toString("base64")}`,
  );
  await inspection.close();
  await page.bringToFront();
  const expectedPixel = [1, 3, 5].map((index) => parseInt(committed.slice(index, index + 2), 16));
  for (let index = 0; index < 3; index++)
    expect(Math.abs(pixel[index]! - expectedPixel[index]!)).toBeLessThanOrEqual(2);
  await page.evaluate(() => window.musart!.undo());
  expect(await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.background)).toBe(
    original,
  );
  expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  const adapter = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    return adapter?.info
      ? {
          vendor: adapter.info.vendor,
          architecture: adapter.info.architecture,
          device: adapter.info.device,
          description: adapter.info.description,
        }
      : null;
  });
  await writeFile(
    output,
    JSON.stringify(
      {
        browser: page.context().browser()!.version(),
        viewport: page.viewportSize(),
        dpr: await page.evaluate(() => devicePixelRatio),
        adapter,
        initial,
        dragInitial: {
          revision: dragInitial.revision,
          commits: dragInitial.commits,
        },
        openings,
        during,
        committed,
        pixel,
        probe,
        reads,
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
  expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  if (process.env.MUSART_COLOR_BASELINE !== "1") {
    expect(
      probe.reads.filter(
        (read: { target: string; phase: string }) =>
          read.target.includes("react-colorful") && read.phase === "pointermove",
      ),
    ).toEqual([]);
  }
  await native.detach();
});
