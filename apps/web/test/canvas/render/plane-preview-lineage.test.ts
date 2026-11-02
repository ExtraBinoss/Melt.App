import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPage } from "@musart/core";
import { OrthographicCamera, Scene, Texture, type WebGPURenderer } from "three/webgpu";
import { PlaneResources } from "../../../src/canvas/render/plane-resources";
import type * as RenderModule from "@musart/render";
import { CanonicalPresentation } from "../../../src/state/session/canonical-presentation";
import type { CanonicalContinuation } from "../../../src/canvas/render/frame-request";

const gpu = vi.hoisted(() => ({ render: vi.fn(), dispose: vi.fn() }));
vi.mock("@musart/render", async (original) => ({
  ...(await original<typeof RenderModule>()),
  gpuTextureLimit: () => 8192,
  GpuCompositor: class {
    render = gpu.render;
    dispose = gpu.dispose;
    retainedFrame = () => null;
    releasePresentation() {}
    stats = () => ({ passes: 1, readbacks: 0, uploads: 1, targets: 2, cacheBytes: 100 });
  },
}));
const output = () => ({ texture: new Texture(), width: 100, height: 80 });
async function ticks() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
async function frame() {
  await vi.runOnlyPendingTimersAsync();
  await ticks();
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  gpu.render.mockReset().mockImplementation(async () => output());
  gpu.dispose.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("presents completed held-transform frames without starvation and rejects replaced or canonical supersession", async () => {
  const renderer = {
    domElement: document.createElement("canvas"),
    backend: {},
    compileAsync: vi.fn().mockResolvedValue(undefined),
    getRenderTarget: () => null,
  } as unknown as WebGPURenderer;
  const resources = new PlaneResources(renderer),
    scene = new Scene();
  const release = resources.activate(scene, new OrthographicCamera(), vi.fn());
  const page = createPage({ width: 100, height: 80 }),
    assets = {},
    origin = { projectId: "p", revision: 1 };
  resources.submit(page, assets, { origin, canonical: true });
  await frame();
  resources.present();
  let finish!: (value: ReturnType<typeof output>) => void;
  gpu.render.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const preview = {};
  resources.submit({ ...page }, assets, { origin, canonical: false, preview });
  await frame();
  const pending = gpu.render.mock.calls.at(-1)![2];
  resources.submit({ ...page }, assets, { origin, canonical: false, preview });
  resources.submit({ ...page }, assets, { origin, canonical: false, preview });
  expect(pending.signal.aborted).toBe(false);
  expect(pending.canRender()).toBe(true);
  finish(output());
  await ticks();
  resources.present();
  expect(renderer.domElement.dataset.renderedRevision).toBe("2");
  expect(renderer.domElement.dataset.sceneRevision).toBe("4");
  expect(renderer.domElement.dataset.rendererReady).toBe("false");
  gpu.render.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await frame();
  const replaced = gpu.render.mock.calls.at(-1)![2];
  const replacementPreview = {};
  resources.submit({ ...page }, assets, { origin, canonical: false, preview: replacementPreview });
  expect(replaced.signal.aborted).toBe(true);
  expect(replaced.canRender()).toBe(false);
  finish(output());
  await ticks();
  resources.present();
  expect(renderer.domElement.dataset.renderedRevision).toBe("5");
  gpu.render.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  resources.submit({ ...page }, assets, { origin, canonical: false, preview: replacementPreview });
  await frame();
  const cancelled = gpu.render.mock.calls.at(-1)![2];
  resources.submit(page, assets, { origin, canonical: true });
  expect(cancelled.signal.aborted).toBe(true);
  expect(cancelled.canRender()).toBe(false);
  finish(output());
  await ticks();
  await frame();
  resources.present();
  expect(renderer.domElement.dataset.renderedRevision).toBe(
    renderer.domElement.dataset.sceneRevision,
  );
  expect(renderer.domElement.dataset.rendererReady).toBe("true");
  release();
  await ticks();
  await resources.dispose();
});

it("draws older certified canonical frames with their actual ticket and keeps latest readiness blocked", async () => {
  const renderer = {
    domElement: document.createElement("canvas"),
    backend: {},
    compileAsync: vi.fn().mockResolvedValue(undefined),
    getRenderTarget: () => null,
  } as unknown as WebGPURenderer;
  const resources = new PlaneResources(renderer),
    port = new CanonicalPresentation();
  const release = resources.activate(
    new Scene(),
    new OrthographicCamera(),
    vi.fn(),
    undefined,
    undefined,
    port.acquire(),
  );
  const page = createPage({ width: 100, height: 80 }),
    assets = {};
  const origin = (revision: number) => ({ projectId: "p", revision });
  resources.submit(page, assets, { origin: origin(1), canonical: true });
  await frame();
  resources.present();
  expect(port.ready(origin(1))).toBe(true);
  let finish!: (value: ReturnType<typeof output>) => void;
  gpu.render.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const continuation = {} as CanonicalContinuation;
  resources.submit({ ...page }, assets, { origin: origin(2), canonical: true, continuation });
  await frame();
  const pending = gpu.render.mock.calls.at(-1)![2];
  resources.submit({ ...page }, assets, { origin: origin(3), canonical: true, continuation });
  expect(pending.signal.aborted).toBe(false);
  finish(output());
  await ticks();
  // A second job must wait until the completed texture actually reaches display.
  const calls = gpu.render.mock.calls.length;
  await frame();
  expect(gpu.render).toHaveBeenCalledTimes(calls);
  resources.present();
  expect(renderer.domElement.dataset.canonicalRevision).toBe("2");
  expect(renderer.domElement.dataset.rendererReady).toBe("false");
  expect(port.read().presented?.revision).toBe(2);
  expect(port.ready(origin(3))).toBe(false);
  await frame();
  resources.present();
  expect(renderer.domElement.dataset.canonicalRevision).toBe("3");
  expect(port.ready(origin(3))).toBe(true);
  gpu.render.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  resources.submit({ ...page }, assets, { origin: origin(4), canonical: true, continuation });
  await frame();
  const obsolete = gpu.render.mock.calls.at(-1)![2];
  resources.submit(page, assets, { origin: origin(5), canonical: true });
  expect(obsolete.signal.aborted).toBe(true);
  expect(obsolete.canRender()).toBe(false);
  finish(output());
  await ticks();
  resources.present();
  expect(renderer.domElement.dataset.canonicalRevision).toBe("3");
  await frame();
  resources.present();
  expect(port.ready(origin(5))).toBe(true);
  release();
  await ticks();
  await resources.dispose();
});

it("keeps a canonical draw through opacity preview-clear-commit but rejects true cancel and load", async () => {
  const renderer = {
    domElement: document.createElement("canvas"),
    backend: {},
    compileAsync: vi.fn().mockResolvedValue(undefined),
    getRenderTarget: () => null,
  } as unknown as WebGPURenderer;
  const resources = new PlaneResources(renderer),
    port = new CanonicalPresentation();
  const release = resources.activate(
    new Scene(),
    new OrthographicCamera(),
    vi.fn(),
    undefined,
    undefined,
    port.acquire(),
  );
  const page = createPage({ width: 100, height: 80 }),
    assets = {};
  const origin = (revision: number) => ({ projectId: "p", revision });
  resources.submit(page, assets, { origin: origin(1), canonical: true });
  await frame();
  resources.present();
  let finish!: (value: ReturnType<typeof output>) => void;
  const defer = () =>
    gpu.render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  const continuation = {} as CanonicalContinuation;
  defer();
  resources.submit({ ...page }, assets, { origin: origin(2), canonical: true, continuation });
  await frame();
  const pending = gpu.render.mock.calls.at(-1)![2];
  resources.submit({ ...page }, assets, {
    origin: origin(2),
    canonical: false,
    preview: {},
    baseContinuation: continuation,
  });
  expect(pending.canRender()).toBe(true);
  expect(pending.signal.aborted).toBe(false);
  resources.submit(page, assets, {
    origin: origin(2),
    canonical: true,
    baseContinuation: continuation,
  });
  expect(pending.canRender()).toBe(false);
  expect(pending.signal.aborted).toBe(false);
  resources.submit({ ...page }, assets, { origin: origin(3), canonical: true, continuation });
  await ticks();
  expect(pending.signal.aborted).toBe(false);
  expect(pending.canRender()).toBe(true);
  finish(output());
  await ticks();
  resources.present();
  expect(renderer.domElement.dataset.canonicalRevision).toBe("2");
  expect(port.ready(origin(3))).toBe(false);
  defer();
  await frame();
  const cancelled = gpu.render.mock.calls.at(-1)![2];
  resources.submit({ ...page }, assets, {
    origin: origin(3),
    canonical: false,
    preview: {},
    baseContinuation: continuation,
  });
  resources.submit(page, assets, {
    origin: origin(3),
    canonical: true,
    baseContinuation: continuation,
  });
  expect(cancelled.canRender()).toBe(false);
  expect(cancelled.signal.aborted).toBe(false);
  await ticks();
  expect(cancelled.signal.aborted).toBe(true);
  finish(output());
  await ticks();
  resources.present();
  expect(renderer.domElement.dataset.canonicalRevision).toBe("2");
  await frame();
  resources.present();
  expect(port.ready(origin(3))).toBe(true);
  defer();
  resources.submit({ ...page }, assets, { origin: origin(4), canonical: true, continuation });
  await frame();
  const loaded = gpu.render.mock.calls.at(-1)![2];
  resources.submit(page, assets, { origin: origin(5), canonical: true });
  expect(loaded.canRender()).toBe(false);
  expect(loaded.signal.aborted).toBe(true);
  finish(output());
  await ticks();
  await frame();
  resources.present();
  expect(port.ready(origin(5))).toBe(true);
  release();
  await ticks();
  await resources.dispose();
});

it("reports only the latest failure while an older certified frame finishes", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const renderer = {
    domElement: document.createElement("canvas"),
    backend: {},
    compileAsync: vi.fn().mockResolvedValue(undefined),
    getRenderTarget: () => null,
  } as unknown as WebGPURenderer;
  const resources = new PlaneResources(renderer),
    report = vi.fn();
  const publisher = new CanonicalPresentation().acquire();
  const release = resources.activate(
    new Scene(),
    new OrthographicCamera(),
    vi.fn(),
    report,
    undefined,
    publisher,
  );
  const page = createPage({ width: 100, height: 80 }),
    assets = {};
  const continuation = {} as CanonicalContinuation;
  let fail!: (error: Error) => void;
  gpu.render.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  resources.submit(page, assets, {
    origin: { projectId: "p", revision: 1 },
    canonical: true,
    continuation,
  });
  await frame();
  resources.submit({ ...page }, assets, {
    origin: { projectId: "p", revision: 2 },
    canonical: true,
    continuation,
  });
  fail(new Error("Superseded frame failure"));
  await ticks();
  expect(report).not.toHaveBeenCalled();
  await frame();
  resources.present();
  expect(renderer.domElement.dataset.canonicalRevision).toBe("2");
  gpu.render.mockRejectedValueOnce(new Error("Latest frame failure"));
  resources.submit({ ...page }, assets, {
    origin: { projectId: "p", revision: 3 },
    canonical: true,
    continuation,
  });
  await frame();
  expect(report).toHaveBeenCalledOnce();
  release();
  await ticks();
  await resources.dispose();
  publisher.release();
});

it("begins certified scalar composition in the current task before the next display frame", async () => {
  const renderer = {
    domElement: document.createElement("canvas"),
    backend: {},
    compileAsync: vi.fn().mockResolvedValue(undefined),
    getRenderTarget: () => null,
  } as unknown as WebGPURenderer;
  const resources = new PlaneResources(renderer);
  const release = resources.activate(new Scene(), new OrthographicCamera(), vi.fn());
  const page = createPage({ width: 100, height: 80 });
  resources.submit(
    page,
    {},
    {
      origin: { projectId: "p", revision: 1 },
      canonical: true,
      continuation: {} as CanonicalContinuation,
    },
  );
  expect(gpu.render).not.toHaveBeenCalled();
  await ticks();
  expect(gpu.render).toHaveBeenCalledOnce();
  resources.present();
  release();
  await ticks();
  await resources.dispose();
});
