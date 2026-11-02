import { createEffect, type Effect, type LiquifyDab } from "../../../packages/core/src/index";
import {
  DataTexture,
  RGBAFormat,
  UnsignedByteType,
  LinearSRGBColorSpace,
  NearestFilter,
  NoColorSpace,
  NoToneMapping,
  RenderTarget,
  WebGPURenderer,
  type Texture,
} from "three/webgpu";
import { GpuEffects } from "../../../packages/render/src/effects/GpuEffects";
import { GpuPasses } from "../../../packages/render/src/compositing/passes";
export async function brushPaperWitness(forceWebGL: boolean) {
  const renderer = new WebGPURenderer({ forceWebGL, antialias: false, alpha: true });
  await renderer.init();
  renderer.setSize(96, 64, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(0, 0);
  const backend = renderer.backend as unknown as {
    isWebGPUBackend?: boolean;
    device?: GPUDevice;
    gl?: WebGL2RenderingContext;
  };
  const gpu = new GpuEffects(renderer),
    copies = new GpuPasses(renderer),
    target = new RenderTarget(96, 64, {
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
    });
  target.texture.colorSpace = NoColorSpace;
  function source(index = 0) {
    const bytes = new Uint8Array(96 * 64 * 4);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 96; x++) {
        const i = (y * 96 + x) * 4;
        bytes[i] = (x * 9 + index) % 256;
        bytes[i + 1] = (y * 13 + index * 7) % 256;
        bytes[i + 2] = ((x + y) * 5 + index) % 256;
        bytes[i + 3] = x > 80 && y > 40 ? 0 : y > 50 ? 128 : 255;
      }
    const texture = new DataTexture(bytes, 96, 64, RGBAFormat, UnsignedByteType);
    texture.colorSpace = NoColorSpace;
    texture.minFilter = texture.magFilter = NearestFilter;
    texture.needsUpdate = true;
    return texture;
  }
  const image = source();
  const settle = async () => {
    if (backend.device) await backend.device.queue.onSubmittedWorkDone();
    else backend.gl!.finish();
  };
  const capture = async (texture: Texture) => {
    renderer.setRenderTarget(null);
    copies.copyTo({ texture, width: 96, height: 64, premultiplied: false }, null, false, true);
    await settle();
    return renderer.domElement.toDataURL("image/png");
  };
  const render = async (effect: Effect) => {
    await gpu.prepare([effect], target, 96, 64);
    return capture(gpu.apply(image, 96, 64, [effect], target));
  };
  const dab: LiquifyDab = {
    x: 0.55,
    y: 0.45,
    dx: 0.15,
    dy: -0.08,
    radius: 0.4,
    strength: 0.8,
    hardness: 0.1,
    mode: "push",
  };
  try {
    const baseline = await capture(image),
      variants = [];
    for (const pattern of ["legacy", "circle-grid", "round-mosaic", "color-screen"]) {
      variants.push({
        name: pattern,
        png: await render(
          createEffect("halftone", { scale: 12, color: true, settings: { pattern, dotSize: 0.9 } }),
        ),
      });
    }
    for (const technique of ["graphic", "paper"]) {
      variants.push({
        name: `torn-${technique}`,
        png: await render(createEffect("torn-edges", { settings: { technique, sourceColor: 1 } })),
      });
    }
    for (const mode of ["push", "pinch", "bloat", "twirl-cw", "twirl-ccw", "restore"] as const) {
      const liquify =
        mode === "restore" ? [dab, { ...dab, mode, strength: 1 }] : [{ ...dab, mode }];
      variants.push({ name: mode, png: await render(createEffect("liquify", { liquify })) });
    }
    const identities = [];
    for (const effect of [
      createEffect("halftone", { settings: { pattern: "color-screen" }, amount: 0 }),
      createEffect("torn-edges", { amount: 0 }),
      createEffect("liquify", { liquify: [dab], amount: 0 }),
      createEffect("liquify"),
    ])
      identities.push(await render(effect));
    const repeat = await render(createEffect("torn-edges"));
    const repeatAgain = await render(createEffect("torn-edges"));
    const stack = [
      createEffect("halftone", { settings: { pattern: "color-screen" } }),
      createEffect("liquify", { liquify: [dab] }),
      createEffect("torn-edges", { settings: { technique: "paper" } }),
    ];
    gpu.apply(image, 96, 64, stack, target);
    await settle();
    const warm = gpu.stats();
    for (let i = 0; i < 50; i++) {
      const next = source(i);
      try {
        gpu.apply(next, 96, 64, stack, target);
        await settle();
      } finally {
        next.dispose();
      }
    }
    const loaded = gpu.stats();
    return {
      baseline,
      variants,
      identities,
      repeat,
      repeatAgain,
      warm,
      loaded,
      backend: backend.isWebGPUBackend ? "webgpu" : "webgl",
    };
  } finally {
    image.dispose();
    target.dispose();
    copies.dispose();
    gpu.dispose();
    await renderer.dispose();
  }
}
