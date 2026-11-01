import type { Asset, Composition } from "@musart/core";
import type { WebGPURenderer } from "three/webgpu";

/** Include retained originals when a materialized Motion pose hides a future video track. */
export function usesVideoSources(
  page: Pick<Composition, "layers">,
  assets?: Readonly<Record<string, Asset>>,
): boolean {
  return (
    page.layers.some((layer) => layer.kind === "video") ||
    Boolean(assets && Object.values(assets).some((asset) => asset.kind === "video"))
  );
}

let compatibility: Promise<boolean> | undefined;

/** Linux Chromium can accept native uploads yet present black without a validation error.
 * Keep its video surfaces on Three's WebGL backend until that path is reliable.
 */
export function hasKnownVideoImportFailure(userAgent: string): boolean {
  return (
    /Linux/.test(userAgent) && !/Android/.test(userAgent) && /(?:Chrome|Chromium)\//.test(userAgent)
  );
}

/** Probe the native operation once, before binding the editor canvas to a GPU context.
 * Synthetic input only: no media pixels are read back or copied into JavaScript.
 */
export function videoNeedsWebGL(): Promise<boolean> {
  return (compatibility ??= probeVideoImport());
}
async function probeVideoImport(): Promise<boolean> {
  let renderer: WebGPURenderer | undefined;
  let device: GPUDevice | undefined;
  let texture: GPUTexture | undefined;
  let frame: VideoFrame | undefined;
  try {
    if (typeof navigator === "undefined" || !navigator.gpu || typeof VideoFrame === "undefined")
      return true;
    if (hasKnownVideoImportFailure(navigator.userAgent)) return true;
    // Three owns device creation and disposal, including its native initialization fallback.
    const { WebGPURenderer: Renderer } = await import("three/webgpu");
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(2, 2)
        : document.createElement("canvas");
    canvas.width = canvas.height = 2;
    renderer = new Renderer({ canvas });
    await renderer.init();
    const backend = renderer.backend as unknown as {
      isWebGPUBackend?: boolean;
      device?: GPUDevice;
    };
    if (!backend.isWebGPUBackend || !backend.device) return true;
    device = backend.device;
    texture = device.createTexture({
      size: [2, 2],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    frame = new VideoFrame(new Uint8Array(16), {
      format: "RGBA",
      codedWidth: 2,
      codedHeight: 2,
      timestamp: 0,
    });
    device.pushErrorScope("validation");
    let imported = false;
    try {
      device.queue.copyExternalImageToTexture({ source: frame }, { texture }, [2, 2]);
      await device.queue.onSubmittedWorkDone();
      imported = true;
    } finally {
      const error = await device.popErrorScope();
      if (error) imported = false;
    }
    return !imported;
  } catch {
    // Three can otherwise swallow a failed native VideoFrame import and display black.
    return true;
  } finally {
    frame?.close();
    texture?.destroy();
    await renderer?.dispose();
  }
}
