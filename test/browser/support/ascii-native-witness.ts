import { createEffect, type Effect } from "@musart/core";
import {
  CanvasTexture,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicNodeMaterial,
  NoBlending,
  NoColorSpace,
  NoToneMapping,
  OrthographicCamera,
  PlaneGeometry,
  RenderTarget,
  Scene,
  Texture,
  WebGPURenderer,
  type Node,
} from "three/webgpu";
import { clamp, dot, floor, fract, mix, texture, uniform, uv, vec2, vec3, vec4 } from "three/tsl";
import { asciiNode } from "../../../packages/render/src/effects/ascii/node";
import { createGlyphAtlas } from "../../../packages/render/src/effects/ascii/atlas";
import { createEffectUniforms } from "../../../packages/render/src/effects/shared/uniforms";
import {
  sampleEffect,
  type EffectNodeContext,
} from "../../../packages/render/src/effects/shared/context";
import { GpuEffects } from "../../../packages/render/src/effects/GpuEffects";

/** Frozen pre-enhancement graph: pixel comparisons must keep legacy documents honest. */
function legacyAscii({ source, controls, getGlyphAtlas }: EffectNodeContext) {
  const position = uv(),
    sample = sampleEffect(source, controls, position),
    pixel = position.mul(controls.logicalResolution);
  const size = vec2(controls.scale.mul(0.65), controls.scale),
    cell = floor(pixel.div(size));
  const blocked = sampleEffect(
    source,
    controls,
    cell.add(0.5).mul(size).div(controls.logicalResolution),
  );
  const brightness = clamp(dot(blocked.rgb, vec3(0.2126, 0.7152, 0.0722)), 0, 0.9999),
    glyph = floor(brightness.mul(16)),
    local = fract(pixel.div(size)),
    atlas = getGlyphAtlas();
  const footprint = controls.pixelFootprint.div(size).mul(0.25);
  const at = (offset: Node<"vec2">) => {
    const p = clamp(local.add(offset), vec2(0.5 / 16), vec2(1 - 0.5 / 16));
    return texture(atlas, vec2(glyph.add(p.x).div(16), p.y)).r;
  };
  const ink = at(footprint)
    .add(at(footprint.negate()))
    .add(at(vec2(footprint.x, footprint.y.negate())))
    .add(at(vec2(footprint.x.negate(), footprint.y)))
    .mul(0.25);
  return vec4(
    mix(sample.rgb, mix(vec3(brightness), blocked.rgb, controls.color).mul(ink), controls.amount),
    sample.a,
  );
}
export async function asciiNativeWitness(forceWebGL: boolean, photos: string[]) {
  const renderer = new WebGPURenderer({ alpha: true, antialias: false, forceWebGL }),
    scene = new Scene(),
    camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1),
    geometry = new PlaneGeometry(2, 2);
  const material = new MeshBasicNodeMaterial({
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
    toneMapped: false,
  });
  scene.add(new Mesh(geometry, material));
  const atlas = createGlyphAtlas(),
    gpu = new GpuEffects(renderer),
    target = new RenderTarget(64, 48, { depthBuffer: false });
  const textures: Texture[] = [],
    bitmaps: ImageBitmap[] = [];
  const backend = () =>
    renderer.backend as unknown as {
      isWebGPUBackend?: boolean;
      device?: GPUDevice & { adapterInfo?: GPUAdapterInfo };
      adapter?: GPUAdapter;
      gl?: WebGL2RenderingContext;
    };
  const settle = async () => {
    if (backend().device) await backend().device!.queue.onSubmittedWorkDone();
    else backend().gl?.finish();
  };
  async function paint(node: Node<"vec4">) {
    material.fragmentNode = node;
    material.needsUpdate = true;
    renderer.setRenderTarget(null);
    renderer.setViewport(0, 0, 128, 96);
    renderer.clear();
    renderer.render(scene, camera);
    await settle();
    return renderer.domElement.toDataURL("image/png");
  }
  let result;
  try {
    await renderer.init();
    renderer.outputColorSpace = LinearSRGBColorSpace;
    renderer.toneMapping = NoToneMapping;
    renderer.setPixelRatio(1);
    renderer.setSize(128, 96, false);
    renderer.setClearColor(0, 0);
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 128;
    sourceCanvas.height = 96;
    const context = sourceCanvas.getContext("2d")!;
    for (let x = 0; x < 128; x++) {
      context.fillStyle = `rgba(${x * 2},${255 - x * 2},${x},${x < 32 ? 0.5 : 1})`;
      context.fillRect(x, 0, 1, 96);
    }
    const source = new CanvasTexture(sourceCanvas);
    source.colorSpace = NoColorSpace;
    textures.push(source);
    const comparisons = [];
    for (const color of [true, false]) {
      const effect = createEffect("ascii", { color, settings: undefined }),
        controls = createEffectUniforms(effect, 128, 96),
        input = texture(source);
      const base = { source: input, controls, getGlyphAtlas: () => atlas };
      const old = await paint(legacyAscii(base));
      const current = await paint(
        asciiNode({
          ...base,
          bindGlyphAtlas: () => ({ texture: texture(atlas), count: uniform(16) }),
        }),
      );
      comparisons.push({ color, old, current });
    }
    const variants = [];
    for (const settings of [
      { characters: " 01@", contrast: 1.8, brightness: 0.1, gamma: 1.4 },
      {
        characters: "█",
        palette: "solid",
        foreground: "#ed3265",
        background: "#10265f",
        glyphScale: 0.9,
        weight: 0.8,
      },
      { characters: " .@", shades: 2, invert: true, cellAspect: 1.1, glyphScale: 0.6 },
      {
        characters: "█",
        palette: "gradient",
        foreground: "#ff0000",
        gradientEnd: "#0000ff",
        glyphScale: 1.5,
        gradientAngle: 0,
      },
      {
        characters: "█",
        palette: "gradient",
        foreground: "#ff0000",
        gradientEnd: "#0000ff",
        glyphScale: 1.5,
        gradientAngle: 90,
      },
    ]) {
      const effect = createEffect("ascii", { settings }),
        controls = createEffectUniforms(effect, 128, 96),
        chars = String(settings.characters),
        custom = createGlyphAtlas(chars);
      textures.push(custom);
      variants.push(
        await paint(
          asciiNode({
            source: texture(source),
            controls,
            getGlyphAtlas: () => custom,
            bindGlyphAtlas: () => ({
              texture: texture(custom),
              count: uniform(Array.from(chars).length),
            }),
          }),
        ),
      );
    }
    renderer.setSize(640, 240, false);
    renderer.autoClear = false;
    renderer.setRenderTarget(null);
    renderer.setViewport(0, 0, 640, 240);
    renderer.clear();
    const copy = texture(target.texture, vec2(uv().x, uv().y.oneMinus()));
    material.fragmentNode = copy;
    material.needsUpdate = true;
    let first = "",
      firstAgain = "",
      firstInput: Texture | undefined;
    const effectFor = (index: number): Effect =>
      createEffect("ascii", {
        settings: {
          characters: " .,:;+tfLCG08M@#" + String(index).padStart(2, "0"),
          palette: "image",
          contrast: 1.1,
          brightness: 0.05,
        },
      });
    const started = performance.now();
    for (let index = 0; index < 50; index++) {
      const blob = await (await fetch(photos[index]!)).blob(),
        bitmap = await createImageBitmap(blob, {
          resizeWidth: 128,
          resizeHeight: 96,
          resizeQuality: "high",
        });
      bitmaps.push(bitmap);
      const input = new Texture(bitmap);
      input.colorSpace = NoColorSpace;
      input.needsUpdate = true;
      textures.push(input);
      if (index === 0) firstInput = input;
      gpu.apply(
        input,
        64,
        48,
        [effectFor(index), createEffect("contrast", { amount: 0.5 })],
        target,
      );
      renderer.setRenderTarget(null);
      renderer.setViewport((index % 10) * 64, Math.floor(index / 10) * 48, 64, 48);
      renderer.render(scene, camera);
      if (index === 0) {
        await settle();
        first = renderer.domElement.toDataURL("image/png");
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    await settle();
    const grid = renderer.domElement.toDataURL("image/png"),
      stressMs = performance.now() - started;
    renderer.setRenderTarget(null);
    renderer.setViewport(0, 0, 640, 240);
    renderer.clear();
    gpu.apply(
      firstInput!,
      64,
      48,
      [effectFor(0), createEffect("contrast", { amount: 0.5 })],
      target,
    );
    renderer.setRenderTarget(null);
    renderer.setViewport(0, 0, 64, 48);
    renderer.render(scene, camera);
    await settle();
    firstAgain = renderer.domElement.toDataURL("image/png");
    const info = backend().device?.adapterInfo ?? backend().adapter?.info,
      gl = backend().gl,
      debug = gl?.getExtension("WEBGL_debug_renderer_info");
    result = {
      comparisons,
      variants,
      grid,
      first,
      firstAgain,
      stressMs,
      stats: gpu.stats(),
      backend: backend().isWebGPUBackend ? "webgpu" : "webgl",
      browser: navigator.userAgent,
      adapter: info
        ? {
            vendor: info.vendor,
            architecture: info.architecture,
            description: info.description,
            device: info.device,
          }
        : debug
          ? { description: gl!.getParameter(debug.UNMASKED_RENDERER_WEBGL) as string }
          : null,
      readbacks: window.__musartVideoReadbacks,
    };
  } finally {
    gpu.dispose();
    target.dispose();
    for (const t of textures) t.dispose();
    for (const b of bitmaps) b.close();
    atlas.dispose();
    material.dispose();
    geometry.dispose();
    await renderer.dispose();
  }
  return { ...result!, disposed: gpu.stats() };
}
