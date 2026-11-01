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
  Scene,
  WebGPURenderer,
  type Node,
} from "three/webgpu";
import { clamp, dot, floor, mix, texture, uv, vec3, vec4 } from "three/tsl";
import { createEffectUniforms } from "../../../packages/render/src/effects/shared/uniforms";
import { ditherNode } from "../../../packages/render/src/effects/dither/node";
import { bitDitherNode } from "../../../packages/render/src/effects/bit-dither/node";
import { bayer4 } from "../../../packages/render/src/effects/dither/bayer";
import {
  sampleEffect,
  type EffectNodeContext,
} from "../../../packages/render/src/effects/shared/context";

// Frozen original operator: palette/default additions must retain existing projects.
function legacyDither({ source, controls }: EffectNodeContext) {
  const position = uv(),
    sample = sampleEffect(source, controls, position);
  const cell = floor(position.mul(controls.logicalResolution).div(controls.scale));
  const blocked = sampleEffect(
    source,
    controls,
    cell.add(0.5).mul(controls.scale).div(controls.logicalResolution),
  );
  const luma = vec3(dot(blocked.rgb, vec3(0.2126, 0.7152, 0.0722)));
  const channel = mix(luma, blocked.rgb, controls.color);
  const threshold = bayer4(cell.add(controls.seed)).sub(0.5);
  const quantized = clamp(
    floor(channel.mul(controls.levels).add(0.5).add(threshold)).div(controls.levels),
    0,
    1,
  );
  return vec4(mix(sample.rgb, quantized, controls.amount), sample.a);
}
export async function sharedDitherWitness(forceWebGL: boolean) {
  const renderer = new WebGPURenderer({ alpha: true, antialias: false, forceWebGL });
  const geometry = new PlaneGeometry(2, 2),
    scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new MeshBasicNodeMaterial({
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
    toneMapped: false,
  });
  scene.add(new Mesh(geometry, material));
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 96;
  const context = canvas.getContext("2d")!;
  for (let x = 0; x < 128; x++) {
    context.fillStyle = `rgba(${x * 2},${255 - x * 2},${x},${x < 32 ? 0.5 : 1})`;
    context.fillRect(x, 0, 1, 96);
  }
  const source = new CanvasTexture(canvas);
  source.colorSpace = NoColorSpace;
  const sourceNode = texture(source);
  function node(effect: Effect, builder: (context: EffectNodeContext) => Node<"vec4">) {
    return builder({
      source: sourceNode,
      controls: createEffectUniforms(effect, 128, 96),
      getGlyphAtlas: () => {
        throw Error("Dither needs no glyph atlas");
      },
    });
  }
  async function paint(output: Node<"vec4">) {
    material.fragmentNode = output;
    material.needsUpdate = true;
    renderer.render(scene, camera);
    const backend = renderer.backend as unknown as {
      device?: GPUDevice;
      gl?: WebGL2RenderingContext;
    };
    if (backend.device) await backend.device.queue.onSubmittedWorkDone();
    else backend.gl?.finish();
    return renderer.domElement.toDataURL("image/png");
  }
  try {
    await renderer.init();
    renderer.setPixelRatio(1);
    renderer.setSize(128, 96, false);
    renderer.outputColorSpace = LinearSRGBColorSpace;
    renderer.toneMapping = NoToneMapping;
    renderer.setClearColor(0, 0);
    const comparisons: { name: string; old: string; current: string }[] = [];
    for (const color of [false, true]) {
      for (const amount of [1, 0.35]) {
        const effect = createEffect("dither", { color, amount, settings: undefined });
        comparisons.push({
          name: `legacy/${color}/${amount}`,
          old: await paint(node(effect, legacyDither)),
          current: await paint(node(effect, ditherNode)),
        });
        for (const method of ["threshold", "bayer2", "bayer4", "bayer8", "interleaved"]) {
          const settings = {
            method,
            threshold: 0.6,
            strength: 0.7,
            contrast: 1.2,
            gamma: 1.15,
            invert: true,
            foreground: "#150a55",
            background: "#f1c788",
          };
          const before = createEffect("bit-dither", {
            color,
            amount,
            scale: 3,
            settings: { ...settings, sourceColor: color },
          });
          const after = createEffect("dither", { color, amount, scale: 3, settings });
          comparisons.push({
            name: `${method}/${color}/${amount}`,
            old: await paint(node(before, bitDitherNode)),
            current: await paint(node(after, ditherNode)),
          });
        }
      }
    }
    const backend = renderer.backend as unknown as { isWebGPUBackend?: boolean };
    return {
      comparisons,
      backend: backend.isWebGPUBackend ? "webgpu" : "webgl",
      browser: navigator.userAgent,
      readbacks: window.__musartVideoReadbacks,
    };
  } finally {
    source.dispose();
    material.dispose();
    geometry.dispose();
    await renderer.dispose();
  }
}
