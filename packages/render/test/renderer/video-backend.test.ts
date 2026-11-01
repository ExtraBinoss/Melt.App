import { afterEach, expect, test, vi } from "vitest";
import { hasKnownVideoImportFailure } from "../../src/renderer/video-backend";
const mocks = vi.hoisted(() => ({ backend: {} as object, init: vi.fn(), dispose: vi.fn() }));
vi.mock("three/webgpu", () => ({
  WebGPURenderer: class {
    backend = mocks.backend;
    init = mocks.init;
    dispose = mocks.dispose;
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("uses the conservative desktop Linux Chromium policy without blocking other operating systems", () => {
  for (const ua of ["Linux Chrome/156.0", "Linux Chrome/157.0", "Linux Chromium/158.0"])
    expect(hasKnownVideoImportFailure(ua)).toBe(true);
  for (const ua of [
    "Windows Chrome/156.0",
    "Macintosh Chrome/156.0",
    "Linux Firefox/159.0",
    "Linux Android Chrome/156.0",
  ])
    expect(hasKnownVideoImportFailure(ua)).toBe(false);
});

test.each(["supported", "throw", "validation", "missing"])(
  "probes native imports once and disposes synthetic resources (%s)",
  async (mode) => {
    vi.resetModules();
    const close = vi.fn(),
      destroyTexture = vi.fn(),
      destroyDevice = vi.fn();
    const copy = vi.fn(() => {
      if (mode === "throw") throw new TypeError("VideoFrame unsupported");
    });
    const device = {
      createTexture: vi.fn(() => ({ destroy: destroyTexture })),
      pushErrorScope: vi.fn(),
      popErrorScope: vi.fn(async () => (mode === "validation" ? Error("validation") : null)),
      queue: { copyExternalImageToTexture: copy, onSubmittedWorkDone: vi.fn(async () => {}) },
      destroy: destroyDevice,
    };
    mocks.backend = { isWebGPUBackend: true, device };
    mocks.init.mockResolvedValue(undefined);
    mocks.dispose.mockImplementation(async () => {
      destroyDevice();
    });
    mocks.init.mockClear();
    mocks.dispose.mockClear();
    vi.stubGlobal("navigator", {
      userAgent: "Windows Chrome/156.0",
      gpu: mode === "missing" ? undefined : {},
    });
    vi.stubGlobal(
      "VideoFrame",
      class {
        close = close;
      },
    );
    vi.stubGlobal("GPUTextureUsage", { COPY_DST: 2, TEXTURE_BINDING: 4, RENDER_ATTACHMENT: 8 });
    const { videoNeedsWebGL } = await import("../../src/renderer/video-backend");
    const first = videoNeedsWebGL();
    expect(videoNeedsWebGL()).toBe(first);
    expect(await first).toBe(mode !== "supported");
    if (mode === "missing") expect(mocks.init).not.toHaveBeenCalled();
    else {
      expect(mocks.init).toHaveBeenCalledOnce();
      expect(copy).toHaveBeenCalledOnce();
      expect(device.popErrorScope).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
      expect(destroyTexture).toHaveBeenCalledOnce();
      expect(destroyDevice).toHaveBeenCalledOnce();
    }
  },
);
