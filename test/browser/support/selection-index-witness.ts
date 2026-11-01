import { mkdir, writeFile } from "node:fs/promises";
import { profileClock } from "./selection-profile";
import { createLayer, createPage, createProject, type Project } from "@musart/core";
import type { Page } from "@playwright/test";
export interface IndexTarget {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export function selectionIndexFixture(count: number): { project: Project; targets: IndexTarget[] } {
  const columns = Math.ceil(Math.sqrt((count * 16) / 9));
  const layers = Array.from({ length: count }, (_, index) =>
    createLayer("rectangle", {
      id: `indexed-${index}`,
      name: `Indexed item ${index}`,
      x: 24 + (index % columns) * 32,
      y: 24 + Math.floor(index / columns) * 32,
      width: 18,
      height: 18,
      fill: index % 2 ? "#8755e8" : "#24a79a",
    }),
  );
  const indices = [columns + 2, columns + 4, columns * 2 + 2].filter((index) => index < count);
  return {
    project: createProject({
      id: `selection-index-${count}`,
      pages: [
        createPage({
          id: "indexed-board",
          width: columns * 32 + 48,
          height: Math.ceil(count / columns) * 32 + 48,
          layers,
        }),
      ],
    }),
    targets: indices.map((index) => {
      const { id, x, y, width, height } = layers[index]!;
      return { id, x, y, width, height };
    }),
  };
}
export interface IndexPresentationSample {
  eventAt: number;
  dispatchAt: number;
  handlerEndAt: number;
  outlineAt: number;
  firstRafAt: number;
  opportunityAt: number;
  dispatchToOutlineMs: number;
  dispatchToOpportunityMs: number;
  dispatchToMicrotaskMs: number;
  before: Record<string, number>;
  after: Record<string, number>;
}
declare global {
  interface Window {
    __indexAdapter?: { vendor: string; architecture: string; device: string; description: string };
    __indexPresentation?: { result?: IndexPresentationSample; error?: string; cancel(): void };
  }
}
/** Record the adapter actually returned to the application's renderer. */
export async function installIndexEnvironment(page: Page) {
  await page.addInitScript(() => {
    const gpu = navigator.gpu;
    if (!gpu) return;
    const request = gpu.requestAdapter.bind(gpu);
    gpu.requestAdapter = async (options) => {
      const adapter = await request(options);
      if (adapter?.info) {
        const { vendor, architecture, device, description } = adapter.info;
        window.__indexAdapter = { vendor, architecture, device, description };
      }
      return adapter;
    };
  });
}
export async function indexEnvironment(page: Page) {
  return page.evaluate(() => ({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    viewport: [innerWidth, innerHeight],
    dpr: devicePixelRatio,
    backend: document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset.backend,
    adapter: window.__indexAdapter ?? null,
  }));
}
/** Observe real input and an actual outline. Two RAFs are a presentation opportunity,
 * never a claim of physical display timing. No document cloning inside measured callbacks.
 */
export async function armIndexPresentation(
  page: Page,
  selector: string,
  event: "pointerdown" | "pointermove" | "pointerover",
  scope: string,
) {
  await page.evaluate(
    ({ selector, event, scope }) => {
      window.__indexPresentation?.cancel();
      const selectors = [
        ".musart-app",
        ".inspector",
        ".canvas-area",
        ".editor-canvas",
        ".editor-gpu-scene",
      ];
      const counters = () =>
        Object.fromEntries(
          selectors.map((selector) => [
            selector,
            Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders ?? 0),
          ]),
        );
      let dispatchAt = 0,
        eventAt = 0,
        handlerEndAt = 0,
        outlineAt = 0,
        firstRafAt = 0,
        raf = 0,
        done = false;
      let before: Record<string, number> = {};
      const cleanup = () => {
        clearTimeout(timer);
        cancelAnimationFrame(raf);
        observer.disconnect();
        document.removeEventListener(event, capture, true);
        document.removeEventListener(event, bubble);
      };
      const state: NonNullable<Window["__indexPresentation"]> = {
        cancel: () => {
          done = true;
          cleanup();
        },
      };
      const finish = () => {
        if (done || !outlineAt || !firstRafAt) return;
        done = true;
        state.result = {
          eventAt,
          dispatchAt,
          handlerEndAt,
          outlineAt,
          firstRafAt,
          opportunityAt: performance.now(),
          dispatchToOutlineMs: outlineAt - dispatchAt,
          dispatchToOpportunityMs: performance.now() - dispatchAt,
          dispatchToMicrotaskMs: Math.max(0, handlerEndAt - dispatchAt),
          before,
          after: counters(),
        };
        cleanup();
      };
      const inspect = () => {
        if (!dispatchAt || outlineAt) return;
        const node = document.querySelector<HTMLElement>(selector);
        if (!node || node.style.display === "none") return;
        outlineAt = performance.now();
        raf = requestAnimationFrame((time) => {
          firstRafAt = time;
          raf = requestAnimationFrame(finish);
        });
      };
      function capture(input: Event) {
        if (dispatchAt || !(input.target instanceof Element) || !input.target.closest(scope))
          return;
        before = counters();
        eventAt = input.timeStamp;
        dispatchAt = performance.now();
        queueMicrotask(() => {
          handlerEndAt = performance.now();
          inspect();
        });
        inspect();
      }
      function bubble() {
        if (dispatchAt && !handlerEndAt) {
          handlerEndAt = performance.now();
          inspect();
        }
      }
      const observer = new MutationObserver(inspect);
      const surface =
        document.querySelector(".canvas-stage") ?? document.querySelector(".editor-canvas")!;
      observer.observe(surface, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["style", "data-layer-id"],
      });
      const timer = setTimeout(() => {
        if (!done) {
          state.error = "Native input/outline presentation timed out";
          state.cancel();
        }
      }, 10000);
      document.addEventListener(event, capture, true);
      document.addEventListener(event, bubble);
      window.__indexPresentation = state;
    },
    { selector, event, scope },
  );
}
export async function readIndexPresentation(page: Page): Promise<IndexPresentationSample> {
  await page.waitForFunction(() =>
    Boolean(window.__indexPresentation?.result || window.__indexPresentation?.error),
  );
  const state = await page.evaluate(() => ({
    result: window.__indexPresentation?.result,
    error: window.__indexPresentation?.error,
  }));
  if (state.error || !state.result) throw Error(state.error ?? "No native presentation result");
  return state.result;
}
export async function indexCanvasPoint(page: Page, target: IndexTarget) {
  const board = page.getByTestId("artboard"),
    box = (await board.boundingBox())!;
  const size = await board.evaluate((node) => ({
    width: (node as HTMLElement).offsetWidth,
    height: (node as HTMLElement).offsetHeight,
  }));
  return {
    x: box.x + ((target.x + target.width / 2) * box.width) / size.width,
    y: box.y + ((target.y + target.height / 2) * box.height) / size.height,
  };
}

/** Diagnostic-only: keep profile overhead out of the ordinary latency cohort. */
export async function profileIndexInput<T>(
  page: Page,
  label: string,
  run: () => Promise<T>,
): Promise<T> {
  if (process.env.MUSART_SPATIAL_CPU_PROFILE !== "1") return run();
  const session = await page.context().newCDPSession(page);
  let result: T | undefined;
  try {
    await session.send("Profiler.enable");
    await session.send("Profiler.setSamplingInterval", { interval: 500 });
    const clock = await profileClock(session, page);
    await session.send("Profiler.start");
    try {
      result = await run();
      return result;
    } finally {
      const { profile } = await session.send("Profiler.stop");
      await mkdir("artifacts/scene-spatial", { recursive: true });
      await writeFile(
        `artifacts/scene-spatial/cpu-${label}.json`,
        JSON.stringify({ clock, result, profile }),
      );
    }
  } finally {
    await session.detach();
  }
}
