import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";
import {
  EditorEngine,
  createProject,
  createPage,
  createLayer,
  createEffect,
  compileMotion,
  evaluateMotion,
  applyMotionFrame,
  planMotionInitialization,
  createSpatialLayer,
  createSpatialScene,
  type Asset,
  type VideoAsset,
} from "../../../packages/core/src/index";
import {
  exportMotionVideo,
  createRenderSession,
  probeVideoOriginal,
} from "../../../packages/render/src/index";
import { createVideoFixture } from "./video-source-witness";
export async function runTimeWarpScan(forceWebGL: boolean) {
  const fixture = await createVideoFixture();
  const meta = await probeVideoOriginal(fixture.blob);
  const video: VideoAsset = {
    id: "video",
    kind: "video",
    name: "Video",
    mime: fixture.blob.type,
    originalId: "original",
    contentRevision: "scan-v1",
    byteLength: fixture.blob.size,
    width: meta.width,
    height: meta.height,
    duration: meta.duration,
    firstTimestamp: meta.firstTimestamp,
    timeResolution: meta.timeResolution,
    orientation: meta.orientation,
  };
  const photo =
    "data:image/svg+xml;base64," +
    btoa(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#331177"/><path d="M15 0H25V64H15Z" fill="#20ff88"/><circle cx="45" cy="32" r="10" fill="#ff8020"/></svg>',
    );
  const assets: Record<string, Asset> = {
    video,
    photo: {
      id: "photo",
      name: "Photo",
      mime: "image/svg+xml",
      dataUrl: photo,
      width: 64,
      height: 64,
    },
  };
  const effect = createEffect("time-warp-scan", {
    id: "scan",
    settings: { duration: 1, samples: 8, driftX: 0, driftY: 0, feather: 0, showLine: false },
  });
  let engine = new EditorEngine(
    createProject({
      assets,
      pages: [
        createPage({
          id: "page",
          width: 64,
          height: 64,
          background: "transparent",
          layers: [
            createLayer("video", {
              id: "item",
              x: 0,
              y: 0,
              width: 64,
              height: 64,
              assetId: "video",
              effects: [
                createEffect("invert", { id: "prefix" }),
                effect,
                createEffect("invert", { id: "suffix" }),
              ],
            }),
          ],
        }),
      ],
    }),
  );
  engine.execute({
    type: "setCompositionMode",
    mode: "motion",
    confirmed: true,
    plan: planMotionInitialization(engine.getSnapshot()),
  });
  const session = () =>
    createRenderSession({
      forceWebGL,
      maxBytes: 256 * 1024 * 1024,
      mediaResolver: { resolveOriginal: async () => fixture.blob },
    });
  const warm = session(),
    cold = session();
  const render = async (target: ReturnType<typeof session>, time: number) => {
    const project = engine.getSnapshot().project;
    const program = compileMotion(project, { compositionId: "page" });
    const frame = evaluateMotion(
      program,
      { value: Math.round(time * 1000), rate: 1000 },
      { terminalPreview: true },
    );
    return target.withCanvasFrame(
      applyMotionFrame(program, frame),
      project.assets,
      (canvas) => canvas.toDataURL("image/png"),
      { motionFrame: frame },
    );
  };
  try {
    const start = await render(warm, 0);
    const middle = await render(warm, 0.5);
    const end = await render(warm, 1);
    const reverse = await render(warm, 0.5);
    const seek = await render(cold, 1);
    const warmStats = warm.stats();
    engine.execute({ type: "setMotionDuration", duration: { value: 1, rate: 1 } });
    const exported = await exportMotionVideo(engine.getSnapshot().project, {
      compositionId: "page",
      frameRate: { numerator: 4, denominator: 1 },
      audio: false,
      forceWebGL,
      maxGpuBytes: 128 * 1024 * 1024,
      mediaResolver: { resolveOriginal: async () => fixture.blob },
    });
    if (!exported.blob) throw Error("Time warp export produced no video");
    const encoded = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(Error("Missing video data"));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(exported.blob!);
    });
    const directions: Record<string, string> = {};
    for (const direction of ["up", "left", "right"]) {
      engine.execute({
        type: "updateLayers",
        ids: ["item"],
        patch: { effects: [{ ...effect, settings: { ...effect.settings, direction } }] },
      });
      directions[direction] = await render(warm, 1);
    }
    engine.execute({
      type: "updateLayers",
      ids: ["item"],
      patch: {
        effects: [{ ...effect, settings: { ...effect.settings, clock: "manual", progress: 0.25 } }],
      },
    });
    const manual = await render(warm, 1);
    const aborted = new AbortController();
    aborted.abort();
    let cancelled = false;
    try {
      await warm.withCanvasFrame(engine.getSnapshot().project.pages[0]!, assets, () => {}, {
        signal: aborted.signal,
      });
    } catch (error) {
      cancelled = error instanceof DOMException && error.name === "AbortError";
    }

    engine = new EditorEngine(
      createProject({
        assets,
        pages: [
          createPage({
            id: "page",
            width: 64,
            height: 64,
            background: "transparent",
            layers: [
              createLayer("image", {
                id: "item",
                x: 0,
                y: 0,
                width: 64,
                height: 64,
                assetId: "photo",
              }),
            ],
          }),
        ],
      }),
    );
    const image = await render(warm, 0);
    engine.execute({
      type: "updateLayers",
      ids: ["item"],
      patch: {
        effects: [{ ...effect, settings: { ...effect.settings, driftX: 0.5, driftY: 0.2 } }],
      },
    });
    const warped = await render(warm, 0);
    engine.execute({
      type: "updateLayers",
      ids: ["item"],
      patch: { effects: [{ ...effect, amount: 0 }] },
    });
    const zero = await render(warm, 0);
    const imageVariants: Record<string, string> = {};
    for (const edge of ["clamp", "transparent"]) {
      engine.execute({
        type: "updateLayers",
        ids: ["item"],
        patch: {
          effects: [
            {
              ...effect,
              settings: { ...effect.settings, edge, driftX: 0.5, bend: 0.12, zoom: 0.2 },
            },
          ],
        },
      });
      imageVariants[edge] = await render(warm, 0);
    }
    const scene = createSpatialScene();
    scene.shadows = false;
    scene.reflections = { mode: "environment", quality: "draft" };
    engine = new EditorEngine(
      createProject({
        pages: [
          createPage({
            id: "page",
            width: 64,
            height: 64,
            background: "transparent",
            spatial: scene,
            layers: [
              createLayer("rectangle", {
                id: "item",
                width: 64,
                height: 64,
                x: 0,
                y: 0,
                spatial: createSpatialLayer("sphere"),
                effects: [{ ...effect, settings: { ...effect.settings, driftX: 0.25 } }],
              }),
            ],
          }),
        ],
      }),
    );
    const spatial = await render(warm, 0);
    engine.execute({
      type: "setCompositionMode",
      mode: "motion",
      confirmed: true,
      plan: planMotionInitialization(engine.getSnapshot()),
    });
    const spatialMotion = await render(warm, 0.5);
    // A newly hovered effect is absent from the canonical program until committed.
    engine = new EditorEngine(
      createProject({
        assets,
        pages: [
          createPage({
            id: "page",
            width: 64,
            height: 64,
            background: "transparent",
            layers: [
              createLayer("image", {
                id: "item",
                x: 0,
                y: 0,
                width: 64,
                height: 64,
                assetId: "photo",
              }),
            ],
          }),
        ],
      }),
    );
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    const previewProject = engine.getSnapshot().project;
    const previewProgram = compileMotion(previewProject, { compositionId: "page" });
    const previewPlan = evaluateMotion(previewProgram, { value: 1, rate: 2 });
    const previewBase = applyMotionFrame(previewProgram, previewPlan);
    const previewPage = {
      ...previewBase,
      layers: previewBase.layers.map((layer) => ({ ...layer, effects: [effect] })),
    };
    const hoverPreview = await warm.withCanvasFrame(
      previewPage,
      previewProject.assets,
      (canvas) => canvas.toDataURL("image/png"),
      { motionFrame: previewPlan },
    );
    // A normal 50-image/100-effect workload, with one scan added to a single source.
    const loadLayers = Array.from({ length: 50 }, (_, index) =>
      createLayer("image", {
        id: `image-${index}`,
        x: (index % 10) * 16,
        y: Math.floor(index / 10) * 16,
        width: 16,
        height: 16,
        assetId: "photo",
        effects: [
          createEffect("thermal"),
          createEffect("bevel"),
          ...(index === 0 ? [{ ...effect, settings: { ...effect.settings, samples: 4 } }] : []),
        ],
      }),
    );
    engine = new EditorEngine(
      createProject({
        assets,
        pages: [createPage({ id: "page", width: 160, height: 80, layers: loadLayers })],
      }),
    );
    engine.execute({
      type: "setCompositionMode",
      mode: "motion",
      confirmed: true,
      plan: planMotionInitialization(engine.getSnapshot()),
    });
    await render(warm, 1);
    const load = warm.stats();
    return {
      exportVideo: { encoded, frames: exported.frameCount },
      hoverPreview,
      directions,
      manual,
      cancelled,
      imageVariants,
      spatial,
      spatialMotion,
      load,
      start,
      middle,
      end,
      reverse,
      seek,
      image,
      warped,
      zero,
      warmStats,
      finalStats: warm.stats(),
    };
  } finally {
    await warm.dispose();
    await cold.dispose();
  }
}

export async function inspectTimeWarpExport(encoded: string) {
  const input = new Input({
    source: new BlobSource(await (await fetch(encoded)).blob()),
    formats: ALL_FORMATS,
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw Error("Missing exported video track");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    const frames: { time: number; top: number[]; bottom: number[] }[] = [];
    for await (const sample of new VideoSampleSink(track).samples()) {
      try {
        sample.draw(ctx, 0, 0);
        frames.push({
          time: sample.timestamp,
          top: Array.from(ctx.getImageData(32, 8, 1, 1).data),
          bottom: Array.from(ctx.getImageData(32, 60, 1, 1).data),
        });
      } finally {
        sample.close();
      }
    }
    return frames;
  } finally {
    input.dispose();
  }
}
