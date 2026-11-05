import { afterEach, expect, it, vi } from "vitest";
import { createStore } from "jotai";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  EditorEngine,
} from "@musart/core";
import { OrthographicCamera, Scene, Texture, type WebGPURenderer } from "three/webgpu";
import type * as RenderModule from "@musart/render";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { PlaneResources } from "../../../src/canvas/render/plane-resources";
import { createPreviewSource } from "../../../src/state/session/preview-source";
import { previewAtom } from "../../../src/state/session/editor";

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
  for (let i = 0; i < 10; i++) await Promise.resolve();
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each(["geometry", "material", "text", "typography"] as const)(
  "presents asynchronous %s samples during continuous input, coalesces latest, and restores cancellation",
  async (kind) => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      setTimeout(() => callback(0), 0),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
    gpu.render.mockReset().mockImplementation(async () => output());
    gpu.dispose.mockReset().mockResolvedValue(undefined);
    const spatial = createSpatialLayer("extrude");
    const layer = createLayer("text", { id: "native", width: 100, height: 80, spatial });
    const engine = new EditorEngine(
      createProject({ pages: [createPage({ width: 100, height: 80, layers: [layer] })] }),
    );
    const baseline = engine.getSnapshot();
    const store = createStore();
    const controller = new SceneController(engine, createPreviewSource(store));
    const renderer = {
      domElement: document.createElement("canvas"),
      backend: {},
      compileAsync: vi.fn().mockResolvedValue(undefined),
      getRenderTarget: () => null,
    } as unknown as WebGPURenderer;
    const resources = new PlaneResources(renderer);
    const release = resources.activate(new Scene(), new OrthographicCamera(), vi.fn());
    const submit = () => {
      const frame = controller.read();
      resources.submit(frame.page, frame.assets, frame.presentation);
    };
    const stop = controller.subscribe(submit);
    submit();
    await vi.runOnlyPendingTimersAsync();
    await ticks();
    resources.present();
    const patch = (value: number) =>
      kind === "text"
        ? { text: `Live ${value}` }
        : kind === "typography"
          ? { fontSize: 64 + value }
          : {
              spatial:
                kind === "geometry"
                  ? { ...spatial, depth: value / 10 }
                  : { ...spatial, material: { ...spatial.material, roughness: value / 10 } },
            };
    const preview = (value: number) =>
      store.set(previewAtom, { target: "layer", layerId: layer.id, patch: patch(value) });
    let finish!: (value: ReturnType<typeof output>) => void;
    gpu.render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    preview(1);
    await ticks();
    const active = gpu.render.mock.calls.at(-1)![2];
    preview(2);
    preview(3);
    expect(active.signal.aborted).toBe(false);
    expect(active.canRender()).toBe(true);
    finish(output());
    await ticks();
    resources.present();
    expect(renderer.domElement.dataset.renderedRevision).toBe("2");
    expect(renderer.domElement.dataset.sceneRevision).toBe("4");
    expect(engine.getSnapshot()).toBe(baseline);
    await ticks();
    expect(gpu.render.mock.calls.at(-1)![0].layers[0]).toMatchObject(patch(3));
    resources.present();
    expect(renderer.domElement.dataset.renderedRevision).toBe("4");
    store.set(previewAtom, null);
    await vi.runOnlyPendingTimersAsync();
    await ticks();
    resources.present();
    expect(gpu.render.mock.calls.at(-1)![0]).toBe(baseline.project.pages[0]);
    expect(engine.getSnapshot()).toBe(baseline);
    stop();
    release();
    await resources.dispose();
  },
);
