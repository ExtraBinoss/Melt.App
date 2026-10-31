import { createEffect } from "@musart/core";
import { LinearSRGBColorSpace, NoToneMapping, RenderTarget, WebGPURenderer } from "three/webgpu";
import {
  SceneProfileSource,
  type SceneFrameSample,
} from "../../../apps/web/src/canvas/render/scene-profile-source";
import { GpuEffects } from "../../../packages/render/src/effects/GpuEffects";
import { GpuPasses } from "../../../packages/render/src/compositing/passes";
import { VideoRasterizer } from "../../../packages/render/src/sources/video/rasterizer";

/** Small functional witness, not a video-composition throughput benchmark. No pixels are read. */
export async function measureGpuPasses() {
  const renderer = new WebGPURenderer();
  await renderer.init();
  renderer.setSize(32, 32);
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  const rasterizer = new VideoRasterizer(renderer),
    effects = new GpuEffects(renderer),
    passes = new GpuPasses(renderer);
  const targets = Array.from({ length: 4 }, () => new RenderTarget(32, 32));
  const [video, dither, ascii, masked] = targets as [
    RenderTarget,
    RenderTarget,
    RenderTarget,
    RenderTarget,
  ];
  const profile = new SceneProfileSource(renderer, () => null);
  let closed = false;
  try {
    const treatment = [createEffect("dither"), createEffect("ascii")];
    await passes.prepare(video);
    await effects.prepare(treatment, video, 32, 32);
    const result = new Promise<SceneFrameSample>((resolve) => profile.open(resolve));
    profile.begin(1);
    const bytes = new Uint8Array(32 * 32 * 4).fill(128);
    const frame = new VideoFrame(bytes, {
      format: "BGRX",
      codedWidth: 32,
      codedHeight: 32,
      timestamp: 0,
      duration: 33333,
    });
    await rasterizer.render(
      {
        frame,
        assetId: "native-profile",
        contentRevision: "1",
        width: 32,
        height: 32,
        timestamp: { value: 0, rate: 1 },
        requestedTime: { value: 0, rate: 1 },
        duration: { value: 1, rate: 30 },
        rotation: 0,
        flip: false,
        pixelAspectRatio: { numerator: 1, denominator: 1 },
        release() {
          if (!closed) {
            closed = true;
            frame.close();
          }
        },
      },
      video,
    );
    effects.apply(video.texture, 32, 32, [treatment[0]!], dither);
    effects.apply(dither.texture, 32, 32, [treatment[1]!], ascii);
    passes.maskTo(
      { texture: ascii.texture, width: 32, height: 32, premultiplied: true },
      video.texture,
      false,
      masked,
    );
    profile.prepared(1);
    passes.copyTo({ texture: masked.texture, width: 32, height: 32, premultiplied: true }, null);
    profile.presented("native-profile", 1);
    const sample = await result;
    await rasterizer.settle();
    return {
      sample,
      closed,
      backend:
        "isWebGPUBackend" in renderer.backend && renderer.backend.isWebGPUBackend
          ? "webgpu"
          : "webgl",
    };
  } finally {
    profile.dispose();
    await rasterizer.dispose();
    effects.dispose();
    passes.dispose();
    targets.forEach((target) => target.dispose());
    await renderer.dispose();
  }
}
