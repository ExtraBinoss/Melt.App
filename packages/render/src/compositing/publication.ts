import type { RenderTarget, WebGPURenderer } from "three/webgpu";
import { acknowledgeGpuWork } from "../cache/acknowledgement";
import type { FrameTexture, RenderOptions } from "./types";
import { traceRenderFrame } from "../diagnostics/frame-trace";

/** Renderer state has been restored; the previous front buffer can remain visible while this waits. */
export async function completeGpuFrame(
  renderer: WebGPURenderer,
  target: RenderTarget,
  options: RenderOptions,
): Promise<FrameTexture> {
  if (options.mediaMode === "playback") {
    const start = options.profileVideo ? performance.now() : 0;
    await acknowledgeGpuWork(renderer);
    if (options.profileVideo && typeof performance.measure === "function") {
      const name = "Melt frame: gpu-wait";
      performance.measure(name, {
        start,
        end: performance.now(),
        detail: {
          compositionId: options.motionFrame?.compositionId,
          time: options.motionFrame?.time,
        },
      });
      performance.clearMeasures(name);
    }
  }
  options.signal?.throwIfAborted();
  if (options.canRender && !options.canRender())
    throw new DOMException("Rendering deferred.", "AbortError");
  if (options.traceFrames)
    traceRenderFrame(true, "gpu-ready", {
      compositionId: options.motionFrame?.compositionId,
      time: options.motionFrame?.time,
      gpuAcknowledged: options.mediaMode === "playback",
      textureId: target.texture.uuid,
      width: target.width,
      height: target.height,
    });
  return {
    texture: target.texture,
    width: target.width,
    height: target.height,
    premultiplied: true,
  };
}
