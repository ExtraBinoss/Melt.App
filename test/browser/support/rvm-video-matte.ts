import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";
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
import { removeVideoBackground } from "../../../apps/web/src/services/selection/video/process";

const times = [0, 0.28, 2, 5, 9.96];
function distribution(pixels: Uint8ClampedArray, channel: number) {
  let foreground = 0,
    background = 0,
    soft = 0,
    mean = 0;
  for (let i = channel; i < pixels.length; i += 4) {
    const value = pixels[i]!;
    mean += value;
    if (value >= 204) foreground++;
    else if (value <= 10) background++;
    else soft++;
  }
  return { foreground, background, soft, mean: mean / (pixels.length / 4) };
}
function requirePerson(stats: ReturnType<typeof distribution>, pixels: number) {
  if (stats.foreground < pixels * 0.05 || stats.background < pixels * 0.2 || !stats.soft)
    throw Error(
      `Missing opaque person, transparent background or soft edges: ${JSON.stringify(stats)}`,
    );
}
async function dataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(Error("Native image serialization returned no data URL."));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
async function asset(id: string, blob: Blob): Promise<VideoAsset> {
  return {
    id,
    kind: "video",
    name: id,
    originalId: id,
    contentRevision: "one",
    mime: blob.type,
    byteLength: blob.size,
    ...(await probeVideoOriginal(blob)),
  };
}

/** Opt-in real weights + real source + production encoding/rendering; no inference mocks. */
export async function verifyRvmVideoMatte() {
  const response = await fetch("/templates/motion/second-skin/media/second-skin-dancer.mp4");
  if (!response.ok) throw Error(`Second Skin source unavailable: ${response.status}`);
  const original = await response.blob(),
    source = await asset("source", original);
  let completed = 0;
  const generated = await removeVideoBackground(original, source, undefined, (progress) => {
    completed = progress.completed;
    console.log(`RVM source time ${completed.toFixed(2)}/${progress.total}`);
  });
  return inspectRvmVideoMatte(original, source, generated, completed);
}

/** Reinspect an already generated real matte without repeating model inference. */
export async function inspectRvmVideoMatte(
  original: Blob,
  source: VideoAsset,
  generated: Awaited<ReturnType<typeof removeVideoBackground>>,
  completed: number,
) {
  const matte = await asset("matte", generated.blob),
    width = generated.width,
    height = generated.height;
  if (width !== 288 || height !== 512 || completed !== 10)
    throw Error("The complete Second Skin source was not processed at the expected dimensions.");
  const input = new Input({ source: new BlobSource(generated.blob), formats: ALL_FORMATS });
  const canvas = new OffscreenCanvas(width, height),
    context = canvas.getContext("2d", { willReadFrequently: true })!;
  const masks = [];
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw Error("Encoded matte has no video track.");
    const sink = new VideoSampleSink(track);
    for (const time of times) {
      const sample = await sink.getSample(time);
      if (!sample) throw Error(`Encoded matte has no frame at ${time}.`);
      try {
        sample.draw(context, 0, 0, width, height);
        const stats = distribution(context.getImageData(0, 0, width, height).data, 0);
        requirePerson(stats, width * height);
        masks.push({ time, ...stats, image: await dataUrl(await canvas.convertToBlob()) });
      } finally {
        sample.close();
      }
    }
  } finally {
    input.dispose();
  }
  const engine = new EditorEngine(
    createProject({
      assets: { source, matte },
      pages: [
        createPage({
          id: "page",
          width,
          height,
          background: "transparent",
          layers: [
            createLayer("video", {
              id: "clip",
              assetId: source.id,
              x: 0,
              y: 0,
              width,
              height,
              mask: { assetId: matte.id, enabled: true, inverted: false, mode: "luminance" },
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
  const exports = [];
  for (const forceWebGL of [false, true]) {
    const session = createRenderSession({
      forceWebGL,
      mediaMode: "exact",
      mediaResolver: {
        resolveOriginal: async (asset) => (asset.id === source.id ? original : generated.blob),
      },
    });
    try {
      const project = engine.getSnapshot().project,
        page = project.pages[0]!,
        program = compileMotion(project, { compositionId: page.id });
      for (const time of times) {
        const frame = evaluateMotion(program, { value: Math.round(time * 100), rate: 100 });
        const image = await session.withCanvasFrame(
          applyMotionFrame(program, frame),
          project.assets,
          (surface) => {
            const expected = forceWebGL ? "webgl" : "webgpu";
            if (surface.dataset.backend !== expected)
              throw Error(`Expected ${expected}, got ${surface.dataset.backend}.`);
            return surface.toDataURL("image/png");
          },
          { motionFrame: frame },
        );
        // Inspect an exported image, never a production compositor texture.
        const bitmap = await createImageBitmap(await (await fetch(image)).blob());
        try {
          context.clearRect(0, 0, width, height);
          context.drawImage(bitmap, 0, 0);
          const stats = distribution(context.getImageData(0, 0, width, height).data, 3);
          requirePerson(stats, width * height);
          exports.push({ backend: forceWebGL ? "webgl" : "webgpu", time, ...stats, image });
        } finally {
          bitmap.close();
        }
      }
    } finally {
      await session.dispose();
    }
  }
  canvas.width = canvas.height = 1;
  return {
    width,
    height,
    completed,
    mime: generated.blob.type,
    bytes: generated.blob.size,
    matte: await dataUrl(generated.blob),
    masks,
    exports,
  };
}
export type RvmVerification = Awaited<ReturnType<typeof verifyRvmVideoMatte>>;
