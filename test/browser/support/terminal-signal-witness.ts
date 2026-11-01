import {
  createEffect,
  applyMotionFrame,
  compileMotion,
  evaluateMotion,
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
import { createTerminalSignal } from "../../../apps/web/src/services/projects/templates/motion/terminal-signal";

export async function terminalEffectWitness(forceWebGL: boolean) {
  const renderer = new WebGPURenderer({ forceWebGL, antialias: false, alpha: true });
  await renderer.init();
  renderer.setSize(128, 64, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(0, 0);
  const backend = renderer.backend as unknown as {
    device?: GPUDevice;
    gl?: WebGL2RenderingContext;
    isWebGPUBackend?: boolean;
  };
  const gpu = new GpuEffects(renderer),
    copies = new GpuPasses(renderer);
  const target = new RenderTarget(128, 64, {
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
  });
  target.texture.colorSpace = NoColorSpace;
  const sources: CanvasTexture[] = [];
  const image = (index: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = index ? `rgb(${80 + index * 3},${100 + index},${240 - index})` : "#ffffff";
    ctx.fillRect(0, 0, 128, 64);
    ctx.clearRect(48, 32, 32, 16);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = NoColorSpace;
    texture.minFilter = texture.magFilter = NearestFilter;
    sources.push(texture);
    return texture;
  };
  const source = image(0);
  const capture = async (texture: Texture) => {
    renderer.setRenderTarget(null);
    copies.copyTo({ texture, width: 128, height: 64, premultiplied: false }, null, false, true);
    if (backend.device) await backend.device.queue.onSubmittedWorkDone();
    else backend.gl!.finish();
    return renderer.domElement.toDataURL("image/png");
  };
  const render = async (progress: number, cursor = "none", time = 0, amount = 1, blinkRate = 0) =>
    capture(
      gpu.apply(
        source,
        128,
        64,
        [
          createEffect("terminal", {
            amount,
            time,
            settings: { columns: 8, rows: 4, progress, cursor, cursorColor: "#00FF00", blinkRate },
          }),
        ],
        target,
      ),
    );
  try {
    const baseline = await capture(source);
    const empty = await render(0),
      quarter = await render(0.25),
      full = await render(1, "line"),
      identity = await render(0.2, "line", 0, 0);
    const cursor = await render(0.25, "block"),
      underline = await render(0.25, "underline"),
      line = await render(0.25, "line");
    const blinkOn = await render(0.25, "block", 0, 1, 2),
      blinkOff = await render(0.25, "block", 0.3, 1, 2);
    const repeated = await render(0.25, "block", 0, 1, 2);
    const warm = gpu.stats();
    for (let index = 1; index <= 50; index++) {
      gpu.apply(
        image(index),
        128,
        64,
        [createEffect("terminal", { settings: { columns: 8, rows: 4, progress: index / 50 } })],
        target,
      );
    }
    if (backend.device) await backend.device.queue.onSubmittedWorkDone();
    else backend.gl!.finish();
    const loaded = gpu.stats();
    gpu.dispose();
    return {
      backend: backend.isWebGPUBackend ? "webgpu" : "webgl",
      baseline,
      empty,
      quarter,
      full,
      identity,
      cursor,
      underline,
      line,
      blinkOn,
      blinkOff,
      repeated,
      warm,
      loaded,
      disposed: gpu.stats(),
      reads: window.__musartVideoReadbacks,
    };
  } finally {
    gpu.dispose();
    copies.dispose();
    target.dispose();
    sources.forEach((source) => source.dispose());
    await renderer.dispose();
  }
}

export async function terminalTemplateWitness(forceWebGL: boolean) {
  const { project } = createTerminalSignal(),
    page = project.pages[0]!;
  const program = compileMotion(project, { compositionId: page.id });
  const session = createRenderSession({ forceWebGL, maxBytes: 128 * 1024 * 1024 });
  const images: { time: number; image: string }[] = [];
  try {
    for (const time of [0.1, 2.5, 6.8, 9.9, 13, 6.8]) {
      const frame = evaluateMotion(program, { value: Math.round(time * 1000), rate: 1000 });
      const image = await session.withCanvasFrame(
        applyMotionFrame(program, frame),
        project.assets,
        (canvas) => canvas.toDataURL("image/png"),
        { scale: 0.5, motionFrame: frame },
      );
      images.push({ time, image });
    }
    return { images, stats: session.stats(), reads: window.__musartVideoReadbacks };
  } finally {
    await session.dispose();
  }
}
