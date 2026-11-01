import { REVISION, type WebGPURenderer } from "three/webgpu";
import type { PerformanceEnvironment } from "../../state/session/performance-environment";

type BrowserHints = {
  platform?: string;
  mobile?: boolean;
  brands?: { brand: string; version: string }[];
};
type DiagnosticNavigator = Navigator & { userAgentData?: BrowserHints; deviceMemory?: number };

/** Passive, on-demand metadata from the existing renderer. No new adapter or GPU context. */
export function performanceEnvironment(
  canvas: HTMLCanvasElement,
  renderer: WebGPURenderer | null,
): PerformanceEnvironment {
  const nav = navigator as DiagnosticNavigator;
  const ua = nav.userAgent;
  const browser =
    /(?:Edg|OPR|Firefox|Chrome|Chromium)\/([\d.]+)/.exec(ua) ??
    /Version\/([\d.]+).*Safari/.exec(ua);
  const os =
    nav.userAgentData?.platform ??
    (/Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Macintosh/.test(ua)
            ? "macOS"
            : /Linux/.test(ua)
              ? "Linux"
              : nav.platform);
  const values: Record<string, string | number | boolean | undefined> = {
    browser: browser
      ? `${browser[0].startsWith("Version") ? "Safari" : browser[0].split("/")[0]} ${browser[1]}`
      : undefined,
    browserBrands: nav.userAgentData?.brands
      ?.map(({ brand, version }) => `${brand} ${version}`)
      .join(", "),
    os,
    osVersion: /(?:Windows NT |Mac OS X |CPU (?:iPhone )?OS )([\d._]+)/
      .exec(ua)?.[1]
      ?.replaceAll("_", "."),
    platform: nav.platform,
    userAgent: ua,
    mobile: nav.userAgentData?.mobile,
    logicalProcessors: nav.hardwareConcurrency,
    memoryGiB: nav.deviceMemory,
    language: nav.language,
    languages: nav.languages.join(", "),
    viewport: `${innerWidth} × ${innerHeight}`,
    screen: `${screen.width} × ${screen.height}`,
    pixelRatio: devicePixelRatio,
    colorDepth: screen.colorDepth,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    secureContext: globalThis.isSecureContext,
    crossOriginIsolated: globalThis.crossOriginIsolated,
    webGPU: "gpu" in nav,
    videoDecoder: typeof VideoDecoder !== "undefined",
    videoEncoder: typeof VideoEncoder !== "undefined",
    audioDecoder: typeof AudioDecoder !== "undefined",
    audioEncoder: typeof AudioEncoder !== "undefined",
    offscreenCanvas: typeof OffscreenCanvas !== "undefined",
    backend: canvas.dataset.backend,
    rasterSizing: canvas.dataset.rasterSizing,
    threeRevision: REVISION,
    canvas: `${canvas.width} × ${canvas.height}`,
  };
  if (renderer) {
    values.rendererPixelRatio = renderer.getPixelRatio();
    values.outputColorSpace = renderer.outputColorSpace;
    const backend = renderer.backend as typeof renderer.backend & {
      device?: GPUDevice;
      isWebGLBackend?: boolean;
    };
    if (backend.device) {
      const { adapterInfo, features, limits } = backend.device;
      values.gpuVendor = adapterInfo?.vendor;
      values.gpuArchitecture = adapterInfo?.architecture;
      values.gpuDevice = adapterInfo?.device;
      values.gpuDescription =
        adapterInfo?.description ||
        [adapterInfo?.vendor, adapterInfo?.architecture, adapterInfo?.device]
          .filter(Boolean)
          .join(" ") ||
        undefined;
      values.gpuFeatures = [...features].sort().join(", ");
      values.maxTextureSize = limits.maxTextureDimension2D;
      values.maxBufferSize = limits.maxBufferSize;
      values.maxStorageBufferSize = limits.maxStorageBufferBindingSize;
    } else if (backend.isWebGLBackend) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      values.gpuVendor = String(gl.getParameter(gl.VENDOR));
      values.gpuDescription = String(gl.getParameter(gl.RENDERER));
      values.apiVersion = String(gl.getParameter(gl.VERSION));
      values.shadingLanguage = String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION));
      values.maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE));
      values.maxSamples = Number(gl.getParameter(gl.MAX_SAMPLES));
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      if (debug) {
        values.gpuVendor = String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL));
        values.gpuDescription = String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
      }
    }
  }
  return Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, string | number | boolean] =>
        entry[1] !== undefined && entry[1] !== "",
    ),
  );
}
