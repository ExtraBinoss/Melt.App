import {
  applyMotionFrame,
  compileMotion,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  evaluateMotion,
  planMotionInitialization,
  type VideoAsset,
} from "../../../packages/core/src/index";
import { createRenderSession, probeVideoOriginal } from "../../../packages/render/src/index";
import { createVideoFixture } from "./video-source-witness";
import { createMatteWriter } from "../../../apps/web/src/services/selection/video/encode";

/** Tiny deterministic native masks; no AI model, model download or inference. */
export async function runVideoMatteWitness() {
  const original = (await createVideoFixture()).blob;
  const canvas = new OffscreenCanvas(64, 64),
    context = canvas.getContext("2d")!;
  const writer = await createMatteWriter(canvas);
  let finished = false,
    matte: Blob;
  try {
    for (const [index, time] of [0, 0.25, 0.75].entries()) {
      context.fillStyle = index === 1 ? "#000000" : "#ffffff";
      context.fillRect(0, 0, 64, 64);
      await writer.add(time, [0.25, 0.5, 0.75][index]!);
    }
    matte = await writer.finish();
    finished = true;
  } finally {
    if (!finished) await writer.dispose();
    canvas.width = canvas.height = 1;
  }
  const sourceMeta = await probeVideoOriginal(original),
    maskMeta = await probeVideoOriginal(matte);
  const asset = (id: string, blob: Blob, metadata: typeof sourceMeta): VideoAsset => ({
    id,
    kind: "video",
    name: id,
    mime: blob.type,
    originalId: id,
    contentRevision: "one",
    byteLength: blob.size,
    width: metadata.width,
    height: metadata.height,
    duration: metadata.duration,
    firstTimestamp: metadata.firstTimestamp,
    timeResolution: metadata.timeResolution,
    orientation: metadata.orientation,
  });
  const source = asset("source", original, sourceMeta),
    mask = asset("matte", matte, maskMeta);
  const engine = new EditorEngine(
    createProject({
      assets: { source, matte: mask },
      pages: [
        createPage({
          id: "page",
          width: 96,
          height: 64,
          background: "#ffffff",
          layers: [
            createLayer("video", {
              id: "clip",
              assetId: source.id,
              x: 0,
              y: 0,
              width: 64,
              height: 64,
              mask: { assetId: mask.id, enabled: true, inverted: false, mode: "luminance" },
            }),
          ],
        }),
      ],
    }),
  );
  engine.execute({
    type: "setCompositionMode",
    mode: "motion",
    plan: planMotionInitialization(engine.getSnapshot(), source.duration),
    confirmed: true,
  });
  const session = createRenderSession({
    forceWebGL: true,
    mediaMode: "exact",
    mediaResolver: {
      resolveOriginal: async (asset) => (asset.id === source.id ? original : matte),
    },
  });
  const images: string[] = [];
  try {
    async function draw(seconds: number) {
      const project = engine.getSnapshot().project,
        page = project.pages[0]!;
      const program = compileMotion(project, { compositionId: page.id }),
        frame = evaluateMotion(program, { value: Math.round(seconds * 100), rate: 100 });
      images.push(
        await session.withCanvasFrame(
          applyMotionFrame(program, frame),
          project.assets,
          (surface) => surface.toDataURL("image/png"),
          { motionFrame: frame },
        ),
      );
    }
    await draw(0);
    await draw(0.5);
    await draw(1);
    await draw(0.5);
    const track = engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!;
    engine.transaction([
      {
        type: "setMotionTrackRange",
        trackId: track.id,
        start: { value: 0, rate: 1 },
        end: { value: 5, rate: 4 },
      },
      {
        type: "setMotionMedia",
        trackId: track.id,
        patch: { sourceIn: { value: 1, rate: 4 } },
      },
    ]);
    await draw(0);
    await draw(0.75);
    engine.execute({ type: "updateLayers", ids: ["clip"], patch: { x: 32 } });
    await draw(0.75);
    return {
      images,
      stats: session.stats(),
      readbacks: { ...window.__musartVideoReadbacks },
      native: { ...(window as unknown as { __musartNativeVideo: object }).__musartNativeVideo },
      duration: mask.duration,
    };
  } finally {
    await session.dispose();
  }
}
