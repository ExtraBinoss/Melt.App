import { afterEach, expect, it, vi } from "vitest";
import { createPage, type Composition } from "@musart/core";
import { OrthographicCamera, Scene, Texture, type WebGPURenderer } from "three/webgpu";
import { PlaneResources } from "../../../src/canvas/render/plane-resources";
const render = vi.hoisted(() => vi.fn());
vi.mock("@musart/render", async (original) => ({
  ...(await original<typeof import("@musart/render")>()),
  gpuTextureLimit: () => 8192,
  GpuCompositor: class {
    render = render;
    retainedFrame = () => null;
    releasePresentation = () => {};
    stats = () => null;
    dispose = async () => {};
  },
}));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("reuses bounded sequential video decode only while explicitly profiling without starting playback", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  render.mockImplementation(async (page: Composition) => ({
    texture: new Texture(),
    width: page.width,
    height: page.height,
  }));
  const renderer = {
    backend: {},
    domElement: document.createElement("canvas"),
    hasFeature: () => false,
    info: { autoReset: true, reset: () => {} },
    compileAsync: async () => {},
  } as unknown as WebGPURenderer;
  const resources = new PlaneResources(renderer);
  const release = resources.activate(new Scene(), new OrthographicCamera(), () => {});
  const close = resources.profile.open(() => {});
  try {
    resources.submit(createPage(), {});
    await vi.runOnlyPendingTimersAsync();
    expect(render).toHaveBeenLastCalledWith(
      expect.anything(),
      {},
      expect.objectContaining({ mediaMode: "preview", mediaSequential: true, profileVideo: true }),
    );
    close();
    resources.submit(createPage(), {});
    await vi.runOnlyPendingTimersAsync();
    expect(render.mock.calls.at(-1)?.[2]).not.toHaveProperty("mediaSequential");
  } finally {
    close();
    release();
    await resources.dispose();
  }
});
