import { LinearSRGBColorSpace, NoToneMapping, RenderTarget, WebGPURenderer } from "three/webgpu";
import { VideoRasterizer } from "../../../packages/render/src/sources/video/rasterizer";
import type { VideoFrameLease } from "../../../packages/render/src/sources/video/model";

/** Native synthetic inputs expose padding bytes; only this verification helper reads GPU pixels. */
export async function inspectOpaqueVideoFrames(webgl: boolean) {
  const renderer = new WebGPURenderer({ forceWebGL: webgl });
  await renderer.init();
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  const rasterizer = new VideoRasterizer(renderer),
    target = new RenderTarget(4, 4);
  const samples = [];
  let closed = 0;
  try {
    for (const format of ["BGRX", "RGBA", "RGBX", "BGRA", "BGRX"] as const) {
      for (const padding of [0, 1, 127, 255]) {
        const bytes = new Uint8Array(4 * 4 * 4);
        for (let index = 0; index < bytes.length; index += 4)
          bytes.set([30, 80, 180, padding], index);
        const frame = new VideoFrame(bytes, {
          format,
          codedWidth: 4,
          codedHeight: 4,
          timestamp: samples.length * 33333,
          duration: 33333,
        });
        let released = false;
        const lease: VideoFrameLease = {
          frame,
          assetId: "opaque-padding",
          contentRevision: "fixture",
          requestedTime: { value: samples.length, rate: 30 },
          timestamp: { value: samples.length, rate: 30 },
          duration: { value: 1, rate: 30 },
          width: 4,
          height: 4,
          rotation: 0,
          flip: false,
          pixelAspectRatio: { numerator: 1, denominator: 1 },
          release() {
            if (released) return;
            released = true;
            frame.close();
            closed++;
          },
        };
        await rasterizer.render(lease, target);
        await rasterizer.settle();
        const pixel = await renderer.readRenderTargetPixelsAsync(target, 1, 1, 1, 1);
        samples.push({ format, padding, pixel: Array.from(pixel) });
      }
    }
    return {
      samples,
      closed,
      stats: rasterizer.stats(),
      webgl: "isWebGLBackend" in renderer.backend && renderer.backend.isWebGLBackend === true,
    };
  } finally {
    await rasterizer.dispose();
    target.dispose();
    await renderer.dispose();
  }
}
