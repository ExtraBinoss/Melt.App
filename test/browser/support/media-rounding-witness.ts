import {
  createProject,
  createPage,
  createLayer,
  createEffect,
  EditorEngine,
  compileMotion,
  evaluateMotion,
  applyMotionFrame,
  type Asset,
  type Effect,
  type VideoAsset,
} from "../../../packages/core/src/index";
import { createRenderSession, probeVideoOriginal } from "../../../packages/render/src/index";
import { createVideoFixture } from "./video-source-witness";
export async function runMediaRounding(forceWebGL: boolean) {
  const assets: Record<string, Asset> = {
    photo: {
      id: "photo",
      name: "Photo",
      mime: "image/svg+xml",
      width: 64,
      height: 64,
      dataUrl:
        "data:image/svg+xml;base64," +
        btoa(
          '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><linearGradient id="g"><stop stop-color="#ee3311"/><stop offset="1" stop-color="#88aa33"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/></svg>',
        ),
    },
  };
  let blob: Blob | undefined;
  if (forceWebGL) {
    const fixture = await createVideoFixture();
    blob = fixture.blob;
    const meta = await probeVideoOriginal(blob);
    const video: VideoAsset = {
      id: "video",
      kind: "video",
      name: "Video",
      mime: blob.type,
      originalId: "original",
      contentRevision: "v1",
      byteLength: blob.size,
      width: meta.width,
      height: meta.height,
      duration: meta.duration,
      firstTimestamp: meta.firstTimestamp,
      timeResolution: meta.timeResolution,
      orientation: meta.orientation,
    };
    assets.video = video;
  }
  const results = [];
  for (const kind of forceWebGL ? (["image", "video"] as const) : (["image"] as const)) {
    const layer = createLayer(kind, {
      id: "item",
      assetId: kind === "image" ? "photo" : "video",
      x: 32,
      y: 32,
      width: 64,
      height: 64,
    });
    const engine = new EditorEngine(
      createProject({
        assets,
        pages: [
          createPage({
            id: "page",
            width: 128,
            height: 128,
            background: "transparent",
            layers: [layer],
          }),
        ],
      }),
    );
    const session = createRenderSession({
      forceWebGL,
      maxBytes: 64 * 1024 * 1024,
      ...(blob ? { mediaResolver: { resolveOriginal: async () => blob! } } : {}),
    });
    const render = async (radius: number, effects: Effect[] = [], scale = 1) => {
      engine.execute({ type: "updateLayers", ids: ["item"], patch: { radius, effects } });
      const project = engine.getSnapshot().project;
      return session.withCanvasFrame(
        project.pages[0]!,
        project.assets,
        (canvas) => canvas.toDataURL("image/png"),
        { scale },
      );
    };
    try {
      const square = await render(0),
        rounded = await render(24),
        bevel = await render(24, [createEffect("bevel")]);
      const squareShadow = await render(0, [
        createEffect("shadow", {
          amount: 1,
          settings: { offsetX: 0, offsetY: 0, radius: 3, shadowColor: "#000000" },
        }),
      ]);
      const roundedShadow = await render(24, [
        createEffect("shadow", {
          amount: 1,
          settings: { offsetX: 0, offsetY: 0, radius: 3, shadowColor: "#000000" },
        }),
      ]);
      const large = await render(24, [], 2),
        restored = await render(0);
      engine.execute({ type: "setCompositionMode", mode: "motion" });
      for (const [value, time] of [
        [0, 0],
        [24, 1],
      ])
        engine.execute({
          type: "upsertMotionKeyframe",
          target: { kind: "layer", layerId: "item", property: "radius" },
          time: { value: time!, rate: 1 },
          value: value!,
        });
      const project = engine.getSnapshot().project,
        program = compileMotion(project, { compositionId: "page" }),
        frame = evaluateMotion(program, { value: 1, rate: 1 });
      const animated = await session.withCanvasFrame(
        applyMotionFrame(program, frame),
        project.assets,
        (canvas) => canvas.toDataURL("image/png"),
        { motionFrame: frame },
      );
      results.push({
        kind,
        square,
        rounded,
        bevel,
        squareShadow,
        roundedShadow,
        large,
        restored,
        animated,
        stats: session.stats(),
      });
    } finally {
      await session.dispose();
    }
  }
  let workload: ReturnType<ReturnType<typeof createRenderSession>["stats"]> | null = null;
  if (!forceWebGL) {
    const layers = Array.from({ length: 50 }, (_, i) =>
      createLayer("image", {
        id: `tile-${i}`,
        assetId: "photo",
        x: (i % 10) * 16,
        y: Math.floor(i / 10) * 16,
        width: 16,
        height: 16,
        radius: 6,
        effects: [createEffect("bevel", { id: `fx-${i}` })],
      }),
    );
    const page = createPage({ width: 160, height: 80, layers });
    const session = createRenderSession({ maxBytes: 64 * 1024 * 1024 });
    try {
      await session.withCanvasFrame(page, assets, () => undefined);
      workload = session.stats();
    } finally {
      await session.dispose();
    }
  }
  return { results, workload };
}
