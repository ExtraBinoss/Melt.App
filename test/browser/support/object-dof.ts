import type {} from "./readback-probe";
import {
  createEffect,
  createLayer,
  createPage,
  createSpatialLayer,
  createSpatialScene,
  createLayerGeometryIndex,
  type Composition,
} from "../../../packages/core/src/index";
import { LinearSRGBColorSpace, NoToneMapping, WebGPURenderer } from "three/webgpu";
import { GpuCompositor } from "../../../packages/render/src/compositing/GpuCompositor";
import { GpuPasses } from "../../../packages/render/src/compositing/passes";

export async function objectDofWitness(forceWebGL: boolean) {
  const renderer = new WebGPURenderer({ forceWebGL, alpha: true, antialias: false });
  await renderer.init();
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(0, 0);
  const graph = new GpuCompositor(renderer, { maxBytes: 96 * 1024 * 1024 });
  const copies = new GpuPasses(renderer);
  const scene = createSpatialScene();
  scene.camera = { ...scene.camera, projection: "orthographic", yaw: 0, pitch: 0 };
  scene.environment.preset = "none";
  scene.reflections!.mode = "environment";
  scene.shadows = false;
  const owner = createLayer("rectangle", {
    id: "dof-owner",
    x: 20,
    y: 35,
    width: 130,
    height: 120,
    fill: "#ffffff",
    spatial: { ...createSpatialLayer("box"), depth: 0.05 },
    fillGradient: {
      kind: "linear",
      angle: 0,
      stops: Array.from({ length: 12 }, (_, i) => ({
        offset: i / 11,
        color: i % 2 ? "#ffffff" : "#072bce",
      })),
    },
  });
  const page = createPage({
    width: 256,
    height: 192,
    background: "#161616",
    spatial: scene,
    layers: [
      owner,
      createLayer("rectangle", {
        id: "neighbour",
        x: 180,
        y: 60,
        width: 55,
        height: 65,
        fill: "#e82222",
        spatial: { ...createSpatialLayer("box"), z: 0.3 },
      }),
    ],
  });
  async function capture(
    value: Composition,
    viewport?: { x: number; y: number; width: number; height: number },
  ) {
    const frame = await graph.render(value, {}, { scale: 1, viewport });
    renderer.setSize(frame.width, frame.height, false);
    renderer.setRenderTarget(null);
    copies.copyTo(frame, null, frame.premultiplied, false);
    return renderer.domElement.toDataURL("image/png");
  }
  try {
    const baseline = await capture(page);
    const dof = createEffect("depth-of-field", {
      settings: {
        focusDistance: 0.01,
        focusRange: 0.02,
        aperture: 0.7,
        maxBlur: 20,
        edgeProtection: 0,
        quality: "low",
      },
    });
    const local = (effect: typeof dof): Composition => ({
      ...page,
      layers: [{ ...owner, effects: [effect] }, page.layers[1]!],
    });
    const blurred = await capture(local(dof));
    const pointEffect = {
      ...dof,
      settings: { ...dof.settings, focusMode: "point", focusX: 0.5, focusY: 0.5 },
    };
    const focused = await capture(local(pointEffect));
    const world = createLayerGeometryIndex(page).worldBounds(owner.id);
    const focus = {
      x: (world.x + world.width / 2) / page.width,
      y: (world.y + world.height / 2) / page.height,
    };
    const composition: Composition = {
      ...page,
      effects: [
        {
          ...pointEffect,
          id: "composition-focus",
          settings: { ...pointEffect.settings, focusX: focus.x, focusY: focus.y },
        },
      ],
    };
    const full = await capture(composition);
    const viewport = {
      x: 0,
      y: 0,
      width: Math.max(16, Math.floor(focus.x * page.width - 5)),
      height: page.height,
    };
    const crop = await capture(composition, viewport);
    const repeat = await capture(local(pointEffect));
    return {
      baseline,
      blurred,
      focused,
      repeat,
      full,
      crop,
      viewport,
      focus,
      world,
      stats: graph.stats(),
      reads: window.__musartVideoReadbacks,
    };
  } finally {
    copies.dispose();
    await graph.dispose();
    await renderer.dispose();
  }
}
