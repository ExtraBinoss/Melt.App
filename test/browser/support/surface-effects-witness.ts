import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  type EffectType,
} from "../../../packages/core/src/index";
import {
  CanvasTexture,
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
import { createRenderSession } from "../../../packages/render/src/export/standalone";

export async function surfaceEffectsWitness(forceWebGL: boolean) {
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
  const makeImage = (index: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 64;
    const context = canvas.getContext("2d")!;
    const values = [200, 10, 130, 40, 240, 70, 170, 100];
    for (let x = 0; x < 96; x++) {
      const value = values[(x + index) % values.length]!;
      context.fillStyle = `rgb(${value},${value},${value})`;
      context.fillRect(x, 0, 1, 64);
    }
    context.clearRect(32, 32, 32, 32);
    const source = new CanvasTexture(canvas);
    source.colorSpace = NoColorSpace;
    source.minFilter = source.magFilter = NearestFilter;
    return source;
  };
  const source = makeImage(0);
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
  const render = async (
    type: EffectType,
    settings: Record<string, number | string | boolean> = {},
    amount = 1,
    time = 0,
  ) => {
    const texture = gpu.apply(
      source,
      96,
      64,
      [createEffect(type, { settings, amount, time })],
      target,
    );
    return capture(texture);
  };
  try {
    const baseline = await capture(source),
      variants = [];
    for (const type of ["ink-bleed", "pixel-sort", "edge-detect"] as const) {
      const image = await render(type);
      const later = await render(type, {}, 1, 1234);
      const zero = await render(type, {}, 0);
      variants.push({ type, image, later, zero });
    }
    const methods = [];
    for (const method of ["scharr", "sobel", "prewitt", "roberts", "laplacian", "dog"])
      methods.push({
        method,
        image: await render("edge-detect", { method, smoothing: 0, threshold: 0.01 }),
      });
    const reverse = await render("pixel-sort", { order: "descending" });
    const vertical = await render("pixel-sort", { axis: "vertical" });
    const partial = await render("pixel-sort", { window: "64" });
    const spanVariants = [];
    for (const window of ["8", "16", "64"])
      spanVariants.push({ window, image: await render("pixel-sort", { window }) });
    const warm = { ...gpu.stats() };
    for (let index = 0; index < 50; index++) {
      const image = makeImage(index);
      try {
        gpu.apply(
          image,
          96,
          64,
          [createEffect("ink-bleed"), createEffect("pixel-sort"), createEffect("edge-detect")],
          target,
        );
        await settle();
      } finally {
        image.dispose();
      }
    }
    const loaded = gpu.stats();
    const repeated = await render("pixel-sort");
    const density = await capture(
      gpu.apply(
        source,
        96,
        64,
        [createEffect("pixel-sort", { settings: { window: "64" } })],
        target,
        { width: 192, height: 128 },
      ),
    );
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64"><rect width="96" height="64" fill="white"/><path d="M10 10H50V55H10Z" fill="#111"/><circle cx="70" cy="30" r="15" fill="#8956ff"/></svg>';
    const asset = {
      id: "image",
      name: "Still image",
      mime: "image/svg+xml",
      width: 96,
      height: 64,
      dataUrl: "data:image/svg+xml," + encodeURIComponent(svg),
    };
    const session = createRenderSession({ forceWebGL, maxBytes: 64 * 1024 * 1024 });
    const imageOutputs = [];
    try {
      for (const type of [null, "ink-bleed", "pixel-sort", "edge-detect"] as const) {
        const project = createProject({
          assets: { image: asset },
          pages: [
            createPage({
              width: 96,
              height: 64,
              layers: [
                createLayer("image", {
                  assetId: "image",
                  x: 0,
                  y: 0,
                  width: 96,
                  height: 64,
                  effects: type ? [createEffect(type)] : [],
                }),
              ],
            }),
          ],
        });
        imageOutputs.push({
          type: type ?? "baseline",
          image: await session.withCanvasFrame(project.pages[0]!, project.assets, (canvas) =>
            canvas.toDataURL("image/png"),
          ),
        });
      }
    } finally {
      await session.dispose();
    }
    return {
      baseline,
      variants,
      methods,
      spanVariants,
      reverse,
      vertical,
      partial,
      repeated,
      density,
      warm,
      loaded,
      imageOutputs,
      backend: backend.isWebGPUBackend ? "webgpu" : "webgl",
      readbacks: window.__musartVideoReadbacks,
    };
  } finally {
    source.dispose();
    target.dispose();
    gpu.dispose();
    copies.dispose();
    await renderer.dispose();
  }
}
