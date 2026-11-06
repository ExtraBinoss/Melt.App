import type {} from "./readback-probe";
import {
  applyMotionFrame,
  compileMotion,
  createEffect,
  createLayer,
  createLayerGeometryIndex,
  createPage,
  createProject,
  EditorEngine,
  evaluateMotion,
  planMotionInitialization,
  transformPoint,
} from "../../../packages/core/src/index";
import { LinearSRGBColorSpace, NoToneMapping, WebGPURenderer } from "three/webgpu";
import { GpuCompositor } from "../../../packages/render/src/compositing/GpuCompositor";
import { GpuPresentation } from "../../../packages/render/src/export/presentation";

/** Deliberately tiny: exact poses, a rotated/moving parent and a separate moving neighbour. */
function fixture() {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "trail-page",
          width: 192,
          height: 128,
          background: "#000000",
          layers: [
            createLayer("group", {
              id: "parent",
              x: 40,
              y: 4,
              width: 80,
              height: 120,
              rotation: 90,
            }),
            createLayer("rectangle", {
              id: "owner",
              parentId: "parent",
              x: 8,
              y: 20,
              width: 8,
              height: 10,
              fill: "#ff0000",
              mask: { enabled: true, layerId: "mask", mode: "alpha", inverted: false },
              effects: [
                createEffect("trail", {
                  id: "object-trail",
                  amount: 1,
                  settings: { mode: "temporal", echoCount: 2, delay: 0.25, fade: 0.7 },
                }),
              ],
            }),
            createLayer("rectangle", {
              id: "neighbour",
              x: 124,
              y: 32,
              width: 4,
              height: 4,
              fill: "#0000ff",
            }),
            // A stationary world-space mask clips the current owner's right edge while
            // admitting both older poses. It must remain a dependency, never captured paint.
            createLayer("rectangle", {
              id: "mask",
              x: 100,
              y: 0,
              width: 32,
              height: 128,
              fill: "#ffffff",
              maskSource: true,
            }),
          ],
        }),
      ],
    }),
  );
  engine.execute({
    type: "setCompositionMode",
    mode: "motion",
    plan: planMotionInitialization(engine.getSnapshot()),
    confirmed: true,
  });
  for (const [layerId, property, start, end] of [
    ["owner", "x", 8, 72],
    ["parent", "x", 40, 56],
    ["neighbour", "y", 32, 112],
  ] as const)
    for (const [value, time] of [
      [start, 0],
      [end, 1],
    ] as const)
      engine.execute({
        type: "upsertMotionKeyframe",
        target: { kind: "layer", layerId, property },
        time: { value: time, rate: 1 },
        value,
      });
  return engine.getSnapshot().project;
}

/** Production imports render GPU textures; PNG inspection lives on an uninstrumented page. */
export async function captureObjectTemporalTrail(forceWebGL: boolean) {
  const project = fixture(),
    immutableBefore = JSON.stringify(project),
    program = compileMotion(project, { compositionId: "trail-page" }),
    renderer = new WebGPURenderer({ alpha: false, antialias: false, forceWebGL });
  await renderer.init();
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(0, 1);
  document.body.append(renderer.domElement);
  const backend = renderer.backend as unknown as {
    isWebGPUBackend?: boolean;
    device?: GPUDevice;
    gl?: WebGL2RenderingContext;
  };
  const compositor = new GpuCompositor(renderer, { maxBytes: 96 * 1024 * 1024 }),
    presentation = new GpuPresentation(renderer),
    images: { name: string; scale: number; png: string }[] = [],
    glErrors: number[] = [],
    gpuErrors: string[] = [];
  const onGpuError = (event: GPUUncapturedErrorEvent) => gpuErrors.push(event.error.message);
  backend.device?.addEventListener("uncapturederror", onGpuError);
  const pose = (value: number, rate = 1) => {
    const frame = evaluateMotion(program, { value, rate });
    return { frame, page: applyMotionFrame(program, frame) };
  };
  const ownerPoint = (value: number, rate: number, localY: number) => {
    const { page } = pose(value, rate),
      geometry = createLayerGeometryIndex(page);
    return transformPoint(geometry.worldMatrix("owner"), { x: 4, y: localY });
  };
  const expected = {
    present: ownerPoint(1, 1, 7.5),
    echoes: [ownerPoint(3, 4, 7.5), ownerPoint(1, 2, 7.5)],
    maskedPresent: ownerPoint(1, 1, 2.5),
    presentBounds: createLayerGeometryIndex(pose(1).page).worldBounds("owner"),
    neighbour: { x: 126, y: 114 },
    absentNeighbourEchoes: [
      { x: 126, y: 94 },
      { x: 126, y: 74 },
    ],
  };
  let activeStats: ReturnType<GpuCompositor["stats"]> | undefined;
  try {
    for (const { name, value, rate, scale, disable } of [
      { name: "A", value: 1, rate: 1, scale: 1, disable: false },
      { name: "B", value: 1, rate: 2, scale: 1, disable: false },
      { name: "A-repeat", value: 1, rate: 1, scale: 1, disable: false },
      { name: "A-zoom", value: 1, rate: 1, scale: 0.75, disable: false },
      { name: "A-without-trail", value: 1, rate: 1, scale: 1, disable: true },
    ]) {
      const { frame: motionFrame, page } = pose(value, rate);
      const sample = disable
        ? {
            ...page,
            layers: page.layers.map((layer) =>
              layer.id === "owner"
                ? {
                    ...layer,
                    effects: layer.effects.map((effect) => ({ ...effect, enabled: false })),
                  }
                : layer,
            ),
          }
        : page;
      const frame = await compositor.render(sample, project.assets, {
        forceWebGL,
        motionFrame,
        mediaMode: "exact",
        scale,
      });
      presentation.render(frame);
      if (backend.device) await backend.device.queue.onSubmittedWorkDone();
      else backend.gl!.finish();
      const error = backend.gl?.getError();
      if (error) glErrors.push(error);
      images.push({ name, scale, png: renderer.domElement.toDataURL("image/png") });
    }
    activeStats = compositor.stats();
  } finally {
    backend.device?.removeEventListener("uncapturederror", onGpuError);
    presentation.dispose();
    await compositor.dispose();
    await renderer.dispose();
    renderer.domElement.remove();
  }
  return {
    images,
    expected,
    activeStats,
    released: compositor.stats(),
    glErrors,
    gpuErrors,
    backend: backend.isWebGPUBackend ? "webgpu" : "webgl",
    unchanged: JSON.stringify(project) === immutableBefore,
    reads: window.__musartVideoReadbacks,
  };
}
