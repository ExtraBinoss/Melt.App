import type { RenderTarget, WebGPURenderer } from "three/webgpu";
import { acknowledgeGpuWork } from "../cache/acknowledgement";
import type { FrameTexture, RenderOptions } from "./types";

/** Renderer state has been restored; the previous front buffer can remain visible while this waits. */
export async function completeGpuFrame(
  renderer: WebGPURenderer,
  target: RenderTarget,
  options: RenderOptions,
): Promise<FrameTexture> {
  if (options.mediaMode === "playback") await acknowledgeGpuWork(renderer);
  options.signal?.throwIfAborted();
  if (options.canRender && !options.canRender())
    throw new DOMException("Rendering deferred.", "AbortError");
  return {
    texture: target.texture,
    width: target.width,
    height: target.height,
    premultiplied: true,
  };
}
