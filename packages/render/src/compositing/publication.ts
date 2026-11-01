import type { RenderTarget, WebGPURenderer } from "three/webgpu";
import { acknowledgeGpuWork } from "../cache/acknowledgement";
import type { FrameTexture, RenderOptions } from "./types";
import { traceRenderFrame } from "../diagnostics/frame-trace";

export function isGraphicsPlayback(options: RenderOptions): boolean {
  return (
    options.mediaMode === "playback" &&
    !options.videoSources &&
    !options.motionFrame?.mediaRequests.length
  );
}

/** Ordered texture-to-texture submissions need no CPU completion fence. Video playback keeps
 * its conservative publication barrier; native frame ownership has separate bounded upload rings.
 * This promise acknowledges submission, not physical display or GPU completion.
 */
export async function completeGpuFrame(
  renderer: WebGPURenderer,
  target: RenderTarget,
  options: RenderOptions,
): Promise<FrameTexture> {
  const wait =
    options.mediaMode === "playback" &&
    !!(options.videoSources || options.motionFrame?.mediaRequests.length);
  if (wait) {
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
      gpuAcknowledged: wait,
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
