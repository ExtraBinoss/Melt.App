import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPage, createLayer } from "@musart/core";
import { Texture } from "three/webgpu";
import {
  createRenderSession,
  disposeExportRenderers,
  snapshotComposition,
} from "../../src/export/standalone";
const gpu = vi.hoisted(() => ({
  videoFallback: vi.fn(async () => true),
  init: vi.fn(),
  dispose: vi.fn(),
  constructors: vi.fn(),
  render: vi.fn(),
  compositorDispose: vi.fn(),
  present: vi.fn(),
  presentationDispose: vi.fn(),
  compositorConstructors: vi.fn(),
  settle: vi.fn(async () => {}),
}));
vi.mock("../../src/renderer/video-backend", async (original) => ({
  ...(await original<typeof import("../../src/renderer/video-backend")>()),
  videoNeedsWebGL: gpu.videoFallback,
}));
vi.mock("three/webgpu", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three/webgpu")>();
  return {
    ...actual,
    WebGPURenderer: class {
      domElement = document.createElement("canvas");
      toneMapping = 0;
      outputColorSpace = "";
      constructor(options: unknown) {
        gpu.constructors(options);
      }
      init = gpu.init;
      dispose = gpu.dispose;
      setPixelRatio = vi.fn();
      setClearColor = vi.fn();
    },
  };
});
vi.mock("../../src/compositing/GpuCompositor", () => ({
  GpuCompositor: class {
    constructor(_renderer: unknown, options: unknown) {
      gpu.compositorConstructors(options);
    }
    render = gpu.render;
    settleMedia = gpu.settle;
    dispose = gpu.compositorDispose;
    stats = () => ({ readbacks: 0, frames: 2 });
  },
}));
vi.mock("../../src/export/presentation", () => ({
  GpuPresentation: class {
    constructor(private readonly renderer: { domElement: HTMLCanvasElement }) {}
    render(frame: { width: number; height: number }) {
      this.renderer.domElement.width = frame.width;
      this.renderer.domElement.height = frame.height;
      gpu.present(frame);
    }
    dispose = gpu.presentationDispose;
  },
}));
let transfer: ReturnType<typeof vi.fn>;
let close: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  await disposeExportRenderers();
  gpu.videoFallback.mockReset().mockResolvedValue(true);
  gpu.init.mockReset().mockResolvedValue(undefined);
  gpu.dispose.mockReset().mockResolvedValue(undefined);
  gpu.constructors.mockClear();
  gpu.compositorConstructors.mockClear();
  gpu.render
    .mockReset()
    .mockResolvedValue({ texture: new Texture(), width: 16, height: 12, premultiplied: true });
  gpu.compositorDispose.mockReset().mockResolvedValue(undefined);
  gpu.present.mockClear();
  gpu.presentationDispose.mockClear();
  gpu.settle.mockClear();
  transfer = vi.fn();
  close = vi.fn();
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ close }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ({
    transferFromImageBitmap: transfer,
  })) as unknown as HTMLCanvasElement["getContext"]);
});
afterEach(async () => {
  await disposeExportRenderers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("GPU-backed durable export snapshots", () => {
  it("keeps exact video export fences while letting playback present on the ordered GPU queue", async () => {
    const page = createPage({ layers: [createLayer("video", { assetId: "v" })] });
    const session = createRenderSession();
    await session.withCanvasFrame(page, {}, () => {}, { mediaMode: "playback" });
    expect(gpu.present).toHaveBeenCalledOnce();
    expect(gpu.settle).not.toHaveBeenCalled();
    await session.withCanvasFrame(page, {}, () => {}, { mediaMode: "exact" });
    expect(gpu.settle).toHaveBeenCalledOnce();
    await session.dispose();
  });
  it("copies GPU pixels through ImageBitmap and bitmaprenderer without CPU arrays", async () => {
    const canvas = await snapshotComposition(createPage(), {}, {});
    expect([canvas.width, canvas.height]).toEqual([16, 12]);
    expect(transfer).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    expect(gpu.present).toHaveBeenCalledWith(expect.objectContaining({ width: 16 }));
    const again = await snapshotComposition(createPage(), {}, {});
    expect(again).not.toBe(canvas);
    expect(gpu.init).toHaveBeenCalledOnce();
    await snapshotComposition(createPage(), {}, { forceWebGL: true });
    expect(gpu.init).toHaveBeenCalledTimes(2);
  });
  it("retries renderer initialization on the same Three WebGL2 fallback and can recover after failures", async () => {
    gpu.init.mockRejectedValueOnce(new Error("no adapter"));
    await snapshotComposition(createPage(), {}, { forceWebGL: false });
    expect(gpu.constructors).toHaveBeenLastCalledWith(
      expect.objectContaining({ forceWebGL: true }),
    );
    await disposeExportRenderers();
    gpu.init.mockRejectedValueOnce(new Error("webgpu")).mockRejectedValueOnce(new Error("webgl"));
    await expect(snapshotComposition(createPage(), {}, {})).rejects.toThrow("webgl");
    await expect(snapshotComposition(createPage(), {}, {})).resolves.toBeInstanceOf(
      HTMLCanvasElement,
    );
  });
  it("closes an unconsumed bitmap and rejects unavailable bitmap-transfer support", async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    await expect(snapshotComposition(createPage(), {}, {})).rejects.toThrow("transfert GPU");
    expect(close).toHaveBeenCalledOnce();
  });
  it("closes an unconsumed bitmap when browser transfer throws", async () => {
    transfer.mockImplementationOnce(() => {
      throw new Error("transfer failed");
    });
    await expect(snapshotComposition(createPage(), {}, {})).rejects.toThrow("transfer failed");
    expect(close).toHaveBeenCalledOnce();
  });
  it("finishes a pending snapshot before disposing its context", async () => {
    const snapshot = snapshotComposition(createPage(), {}, {});
    const disposal = disposeExportRenderers();
    await expect(snapshot).resolves.toBeInstanceOf(HTMLCanvasElement);
    await disposal;
    expect(gpu.dispose).toHaveBeenCalledOnce();
  });
});
it("isolates snapshot caches by resolver/backend and retains only two idle contexts", async () => {
  const first = vi.fn(async () => new ArrayBuffer(0)),
    second = vi.fn(async () => new ArrayBuffer(0)),
    page = createPage();
  await snapshotComposition(page, {}, { fontResolver: first });
  await snapshotComposition(page, {}, { fontResolver: first });
  expect(gpu.init).toHaveBeenCalledOnce();
  expect(gpu.compositorConstructors).toHaveBeenLastCalledWith(
    expect.objectContaining({ fontResolver: first }),
  );
  await snapshotComposition(page, {}, { fontResolver: first, forceWebGL: true });
  await snapshotComposition(page, {}, { fontResolver: second });
  expect(gpu.init).toHaveBeenCalledTimes(3);
  expect(gpu.dispose).toHaveBeenCalledOnce();
  expect(gpu.compositorConstructors).toHaveBeenLastCalledWith(
    expect.objectContaining({ fontResolver: second }),
  );
  await snapshotComposition(page, {}, { fontResolver: first, forceWebGL: true });
  expect(gpu.init).toHaveBeenCalledTimes(3);
  await snapshotComposition(page, {}, { fontResolver: first });
  expect(gpu.init).toHaveBeenCalledTimes(4);
  expect(gpu.dispose).toHaveBeenCalledTimes(2);
});
it("does not evict active snapshot contexts under pressure from other resolvers", async () => {
  type Frame = { texture: Texture; width: number; height: number; premultiplied: boolean };
  let finish!: (frame: Frame) => void;
  gpu.render.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = vi.fn(async () => new ArrayBuffer(0)),
    page = createPage(),
    pending = snapshotComposition(page, {}, { fontResolver: first });
  await vi.waitFor(() => expect(gpu.render).toHaveBeenCalledOnce());
  await snapshotComposition(page, {}, { fontResolver: async () => new ArrayBuffer(0) });
  await snapshotComposition(page, {}, { fontResolver: async () => new ArrayBuffer(0) });
  expect(gpu.dispose).not.toHaveBeenCalled();
  finish({ texture: new Texture(), width: 16, height: 12, premultiplied: true });
  await expect(pending).resolves.toBeInstanceOf(HTMLCanvasElement);
  expect(gpu.dispose).toHaveBeenCalledOnce();
  await snapshotComposition(page, {}, { fontResolver: first });
  expect(gpu.init).toHaveBeenCalledTimes(3);
});
it("does not let completed old snapshots replace a fresh cache entry after clearing", async () => {
  type Frame = { texture: Texture; width: number; height: number; premultiplied: boolean };
  let finish!: (frame: Frame) => void;
  gpu.render.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const resolver = vi.fn(async () => new ArrayBuffer(0)),
    page = createPage(),
    pending = snapshotComposition(page, {}, { fontResolver: resolver });
  await vi.waitFor(() => expect(gpu.render).toHaveBeenCalledOnce());
  const cleared = disposeExportRenderers();
  await snapshotComposition(page, {}, { fontResolver: resolver });
  finish({ texture: new Texture(), width: 16, height: 12, premultiplied: true });
  await Promise.all([pending, cleared]);
  await snapshotComposition(page, {}, { fontResolver: resolver });
  expect(gpu.init).toHaveBeenCalledTimes(2);
  expect(gpu.dispose).toHaveBeenCalledOnce();
});

it("holds a retained native GPU canvas inside the atomic consumer queue without bitmap copies", async () => {
  const fontResolver = vi.fn(async () => new ArrayBuffer(0));
  const session = createRenderSession({ forceWebGL: true, maxBytes: 1024, fontResolver });
  expect(session.stats()).toBeNull();
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const first = session.withCanvasFrame(createPage(), {}, async (canvas) => {
    entered();
    await hold;
    return canvas;
  });
  await ready;
  const second = session.render(createPage(), {});
  await Promise.resolve();
  expect(gpu.render).toHaveBeenCalledOnce();
  release();
  const canvas = await first;
  expect(await second).toBe(canvas);
  expect(gpu.render).toHaveBeenCalledTimes(2);
  expect(gpu.init).toHaveBeenCalledOnce();
  expect(gpu.compositorConstructors).toHaveBeenCalledWith({ maxBytes: 1024, fontResolver });
  expect(createImageBitmap).not.toHaveBeenCalled();
  expect(session.stats()).toMatchObject({ readbacks: 0, backend: null });
  await session.dispose();
  await expect(session.render(createPage(), {})).rejects.toThrow("fermé");
});
it("shares disposal completion and releases a retained context only once", async () => {
  const session = createRenderSession();
  await session.render(createPage(), {});
  const first = session.dispose(),
    second = session.dispose();
  expect(second).toBe(first);
  await Promise.all([first, second]);
  expect(gpu.dispose).toHaveBeenCalledOnce();
  expect(gpu.presentationDispose).toHaveBeenCalledOnce();
  expect(session.stats()).toBeNull();
});
it("does not create a background context when the activity gate has become busy", async () => {
  const session = createRenderSession();
  await expect(
    session.withCanvasFrame(createPage(), {}, () => {}, { canRender: () => false }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(gpu.init).not.toHaveBeenCalled();
  await session.dispose();
});
it("releases the presentation and renderer even if a native compositor cleanup failed", async () => {
  const session = createRenderSession();
  await session.render(createPage(), {});
  gpu.compositorDispose.mockRejectedValueOnce(Error("native close rejected"));
  await expect(session.dispose()).rejects.toThrow("cleanup failed");
  expect(gpu.presentationDispose).toHaveBeenCalledTimes(1);
  expect(gpu.dispose).toHaveBeenCalledTimes(1);
  expect(session.stats()).toBeNull();
});

it("chooses WebGL for video before first draw, retains it across hidden poses and switches queued surfaces safely", async () => {
  const session = createRenderSession();
  const still = createPage(),
    video = createPage({ layers: [createLayer("video", { assetId: "v" })] });
  await session.render(still, {});
  expect(gpu.constructors).toHaveBeenLastCalledWith({ alpha: true, antialias: false });
  const original = { v: { kind: "video" } } as never;
  await session.render(video, original);
  expect(gpu.constructors).toHaveBeenLastCalledWith({
    alpha: true,
    antialias: false,
    forceWebGL: true,
  });
  expect(gpu.compositorDispose).toHaveBeenCalledTimes(1);
  expect(gpu.presentationDispose).toHaveBeenCalledTimes(1);
  expect(gpu.dispose).toHaveBeenCalledTimes(1);
  await session.render(still, original);
  expect(gpu.constructors).toHaveBeenCalledTimes(2);
  await session.render(still, {});
  expect(gpu.constructors).toHaveBeenCalledTimes(3);
  expect(gpu.constructors).toHaveBeenLastCalledWith({ alpha: true, antialias: false });
  await session.dispose();
  expect(gpu.dispose).toHaveBeenCalledTimes(3);
});
it("starts video sessions on WebGL directly and reports a genuine initialization failure without retry loops", async () => {
  const session = createRenderSession();
  gpu.init.mockRejectedValueOnce(Error("WebGL unavailable"));
  await expect(session.render(createPage({ layers: [createLayer("video")] }), {})).rejects.toThrow(
    "WebGL unavailable",
  );
  expect(gpu.constructors).toHaveBeenCalledTimes(1);
  expect(gpu.dispose).toHaveBeenCalledOnce();
  await session.dispose();
});

it("retains WebGPU and the same renderer when video imports are compatible", async () => {
  gpu.videoFallback.mockResolvedValue(false);
  const session = createRenderSession();
  await session.render(createPage(), {});
  await session.render(createPage({ layers: [createLayer("video")] }), {});
  expect(gpu.constructors).toHaveBeenCalledOnce();
  expect(gpu.constructors).toHaveBeenCalledWith({ alpha: true, antialias: false });
  expect(gpu.dispose).not.toHaveBeenCalled();
  await session.dispose();
});
it("honors stable canonical video hints before a future video appears", async () => {
  const session = createRenderSession({ videoSources: true });
  await session.render(createPage(), {});
  expect(gpu.constructors).toHaveBeenCalledWith(expect.objectContaining({ forceWebGL: true }));
  await session.dispose();
});
