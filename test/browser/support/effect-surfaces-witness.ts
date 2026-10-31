import { createEffect } from "@musart/core";
import {
  CanvasTexture,
  LinearSRGBColorSpace,
  NoColorSpace,
  NoToneMapping,
  RenderTarget,
  WebGPURenderer,
  type Texture,
} from "three/webgpu";
import { GpuEffects } from "../../../packages/render/src/effects/GpuEffects";
import { GpuPasses } from "../../../packages/render/src/compositing/passes";

/** Native allocation hooks observe Three's real backend texture create/destroy calls.
 * PNG decoding happens in a separate inspection page, outside production probes.
 */
export async function effectSurfacesWitness(forceWebGL: boolean) {
  const renderer = new WebGPURenderer({ alpha: true, antialias: false, forceWebGL });
  await renderer.init();
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(0, 0);
  const backend = renderer.backend as unknown as {
    isWebGPUBackend?: boolean;
    device?: GPUDevice & { adapterInfo?: GPUAdapterInfo };
    adapter?: GPUAdapter;
    gl?: WebGL2RenderingContext;
    createTexture(texture: Texture, ...args: unknown[]): unknown;
    destroyTexture(texture: Texture, ...args: unknown[]): unknown;
  };
  const counts = { allocations: 0, destructions: 0, targetDisposals: 0 };
  const create = backend.createTexture,
    destroy = backend.destroyTexture;
  const dispose = RenderTarget.prototype.dispose;
  backend.createTexture = function (texture, ...args) {
    if (texture.isRenderTargetTexture && texture.name === "melt:effect-surface")
      counts.allocations++;
    return create.call(this, texture, ...args);
  };
  backend.destroyTexture = function (texture, ...args) {
    if (texture.isRenderTargetTexture && texture.name === "melt:effect-surface")
      counts.destructions++;
    return destroy.call(this, texture, ...args);
  };
  RenderTarget.prototype.dispose = function () {
    counts.targetDisposals++;
    dispose.call(this);
  };
  const settle = async () => {
    if (backend.device) await backend.device.queue.onSubmittedWorkDone();
    else backend.gl!.finish();
  };
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;
  for (let y = 0; y < 64; y++) {
    context.fillStyle = `rgba(${y * 4},${255 - y * 3},${y % 3 ? 220 : 30},${y < 16 ? 0 : y < 40 ? 0.5 : 1})`;
    context.fillRect(0, y, 96, 1);
  }
  context.clearRect(20, 10, 28, 22);
  const source = new CanvasTexture(canvas);
  source.colorSpace = NoColorSpace;
  const gpu = new GpuEffects(renderer),
    copies = new GpuPasses(renderer);
  const sizes = [
    [80, 24],
    [24, 80],
  ] as const;
  const outputs = sizes.map(
    ([width, height]) =>
      new RenderTarget(width, height, {
        depthBuffer: false,
        stencilBuffer: false,
      }),
  );
  for (const output of outputs) output.texture.colorSpace = NoColorSpace;
  const effects = [
    createEffect("brightness", { amount: 0.15 }),
    createEffect("gradient", { amount: 0.7, settings: { treatment: "glass", style: "mesh" } }),
    createEffect("blur", { amount: 0.35, scale: 3 }),
  ];
  const logical = { width: 160, height: 48 };
  async function capture(output: RenderTarget) {
    renderer.setSize(output.width, output.height, false);
    renderer.setRenderTarget(null);
    // The full-screen NoBlending copy overwrites RGBA. Let its draw bind the
    // canvas framebuffer first: a logical setRenderTarget(null) alone does not
    // rebind WebGL's last framebuffer, so an explicit clear would erase output.
    copies.copyTo(
      { texture: output.texture, width: output.width, height: output.height, premultiplied: false },
      null,
      false,
      true,
    );
    await settle();
    return renderer.domElement.toDataURL("image/png");
  }
  let result, released;
  try {
    const references: string[] = [];
    const glErrors: { phase: string; code: number }[] = [];
    const recordError = (phase: string) => {
      const code = backend.gl?.getError();
      if (code) glErrors.push({ phase, code });
    };
    for (const [index, output] of outputs.entries()) {
      // A new operator per size is independent of pooled content left by another layer.
      const isolated = new GpuEffects(renderer);
      try {
        isolated.apply(source, output.width, output.height, effects, output, logical);
        recordError(`reference-${index}`);
        references[index] = await capture(output);
      } finally {
        isolated.dispose();
      }
    }
    const cold = { ...counts };
    await gpu.prepare(effects, outputs[0]!, logical.width, logical.height);
    for (const [index, output] of outputs.entries()) {
      gpu.apply(source, output.width, output.height, effects, output, logical);
      recordError(`warm-${index}`);
      await capture(output); // Also warm display copy/swapchain at both dimensions.
    }
    const warmed = { ...counts },
      warmStats = gpu.stats();
    const projected: number[] = [];
    for (let index = 0; index < 50; index++) {
      const output = outputs[index % outputs.length]!;
      projected.push(gpu.projectedBytes(output.width, output.height, effects));
      gpu.apply(source, output.width, output.height, effects, output, logical);
      recordError(`alternating-${index}`);
    }
    await settle();
    const after = { ...counts };
    // Reading the first output after the tall layer ran proves durable output ownership.
    const actual: string[] = [];
    for (const output of outputs) {
      actual.push(await capture(output));
    }
    const info = backend.device?.adapterInfo ?? backend.adapter?.info;
    result = {
      references,
      actual,
      glErrors,
      cold,
      warmed,
      after,
      warmStats,
      stats: gpu.stats(),
      projected,
      backend: backend.isWebGPUBackend ? "webgpu" : "webgl",
      browser: navigator.userAgent,
      adapter: info
        ? { vendor: info.vendor, architecture: info.architecture, description: info.description }
        : {
            description: backend.gl?.getParameter(backend.gl.RENDERER) as string | undefined,
          },
      readbacks: window.__musartVideoReadbacks,
    };
  } finally {
    gpu.dispose();
    released = { ...counts };
    copies.dispose();
    source.dispose();
    for (const output of outputs) output.dispose();
    backend.createTexture = create;
    backend.destroyTexture = destroy;
    RenderTarget.prototype.dispose = dispose;
    await renderer.dispose();
  }
  return { ...result!, released: released!, disposed: gpu.stats() };
}
