import { afterEach, expect, test, vi } from "vitest";
import type { WebGPURenderer } from "three/webgpu";
import { performanceEnvironment } from "../../../src/canvas/profiling/environment";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
test("reports the active WebGL renderer and browser capabilities without creating another context", () => {
  const gl = {
    VENDOR: 1,
    RENDERER: 2,
    VERSION: 3,
    SHADING_LANGUAGE_VERSION: 4,
    MAX_TEXTURE_SIZE: 5,
    MAX_SAMPLES: 6,
    getParameter: vi.fn(
      (key: number) =>
        ({
          1: "Generic",
          2: "WebGL",
          3: "WebGL 2",
          4: "GLSL",
          5: 16384,
          6: 4,
          7: "Intel",
          8: "ANGLE Intel",
        })[key],
    ),
    getExtension: vi.fn(() => ({ UNMASKED_VENDOR_WEBGL: 7, UNMASKED_RENDERER_WEBGL: 8 })),
  };
  const renderer = {
    backend: { isWebGLBackend: true },
    getPixelRatio: () => 1,
    outputColorSpace: "srgb-linear",
    getContext: () => gl,
  } as unknown as WebGPURenderer;
  const canvas = document.createElement("canvas");
  canvas.dataset.backend = "webgl";
  const result = performanceEnvironment(canvas, renderer);
  expect(result).toMatchObject({
    backend: "webgl",
    gpuVendor: "Intel",
    gpuDescription: "ANGLE Intel",
    maxTextureSize: 16384,
    rendererPixelRatio: 1,
  });
  expect(result.userAgent).toBe(navigator.userAgent);
  expect(result.logicalProcessors).toBe(navigator.hardwareConcurrency);
  expect(gl.getExtension).toHaveBeenCalledExactlyOnceWith("WEBGL_debug_renderer_info");
});
test("reads WebGPU metadata from the existing device and omits unavailable fields", () => {
  const device = {
    adapterInfo: { vendor: "amd", architecture: "rdna", description: "GPU" },
    features: new Set(["timestamp-query"]),
    limits: { maxTextureDimension2D: 8192, maxBufferSize: 1024, maxStorageBufferBindingSize: 512 },
  };
  const renderer = {
    backend: { device },
    getPixelRatio: () => 2,
    outputColorSpace: "srgb-linear",
  } as unknown as WebGPURenderer;
  const canvas = document.createElement("canvas");
  canvas.dataset.backend = "webgpu";
  const result = performanceEnvironment(canvas, renderer);
  expect(result).toMatchObject({
    backend: "webgpu",
    gpuVendor: "amd",
    gpuArchitecture: "rdna",
    gpuFeatures: "timestamp-query",
    maxStorageBufferSize: 512,
  });
  expect(result).not.toHaveProperty("gpuDevice");
  device.adapterInfo.description = "";
  expect(performanceEnvironment(canvas, renderer).gpuDescription).toBe("amd rdna");
  expect(performanceEnvironment(canvas, null)).not.toHaveProperty("gpuVendor");
});
