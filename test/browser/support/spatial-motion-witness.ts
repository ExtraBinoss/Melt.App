import { exportMotionVideo } from "@musart/render";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
  EditorEngine,
  planMotionInitialization,
  type Project,
} from "@musart/core";
import { BlobSource, Input, ALL_FORMATS, VideoSampleSink } from "mediabunny";
export async function renderSpatialMotion(project?: Project) {
  const engine = new EditorEngine(
    project ??
      createProject({
        pages: [
          createPage({
            id: "spatial-motion",
            width: 128,
            height: 128,
            spatial: createSpatialScene(),
            layers: [
              createLayer("rectangle", {
                id: "cube",
                x: 0,
                y: 0,
                width: 128,
                height: 128,
                fill: "#8757FF",
                spatial: createSpatialLayer("box"),
              }),
            ],
          }),
        ],
      }),
  );
  const page = engine.getSnapshot().project.pages[0]!;
  engine.execute({
    type: "setCompositionMode",
    mode: "motion",
    plan: planMotionInitialization(engine.getSnapshot()),
  });
  const track = engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!;
  const layer = page.layers[0]!;
  engine.transaction([
    { type: "setMotionDuration", duration: { value: 6, rate: 10 } },
    ...[0, 0.6].map((time) => ({
      type: "upsertMotionKeyframe" as const,
      trackId: track.id,
      target: {
        kind: "layer" as const,
        layerId: layer.id,
        property:
          layer.spatial?.source === "glb"
            ? ("spatial.clipTime" as const)
            : ("spatial.rotationY" as const),
      },
      time: { value: Math.round(time * 10), rate: 10 },
      value: layer.spatial?.source === "glb" ? time : time * 150,
    })),
  ]);
  const original = JSON.stringify(engine.getSnapshot().project);
  const progress: number[] = [];
  const result = await exportMotionVideo(engine.getSnapshot().project, {
    compositionId: page.id,
    frameRate: { numerator: 10, denominator: 1 },
    audio: false,
    onProgress: (value) => {
      progress.push(value.fraction);
    },
  });
  if (!result.blob) throw Error("No native Motion file was produced");
  const encoded = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(Error("Invalid encoded Motion result"));
    };
    reader.onerror = reject;
    reader.readAsDataURL(result.blob!);
  });
  return {
    encoded,
    frames: result.frameCount,
    width: result.width,
    height: result.height,
    progress,
    unchanged: JSON.stringify(engine.getSnapshot().project) === original,
  };
}
export async function inspectSpatialMotion(encoded: string) {
  const input = new Input({
    source: new BlobSource(await (await fetch(encoded)).blob()),
    formats: ALL_FORMATS,
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw Error("No decoded video track");
    const width = await track.getDisplayWidth(),
      height = await track.getDisplayHeight();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!;
    const samples: { pixels: number[]; timestamp: number }[] = [];
    for await (const sample of new VideoSampleSink(track).samples()) {
      try {
        sample.draw(context, 0, 0);
        samples.push({
          pixels: [...context.getImageData(0, 0, width, height).data],
          timestamp: sample.timestamp,
        });
      } finally {
        sample.close();
      }
    }
    if (samples.length < 2) throw Error("Insufficient decoded frames");
    const first = samples[0]!.pixels,
      last = samples.at(-1)!.pixels;
    let changed = 0,
      colored = 0;
    for (let i = 0; i < first.length; i += 4) {
      if (
        Math.max(first[i]!, first[i + 1]!, first[i + 2]!) -
          Math.min(first[i]!, first[i + 1]!, first[i + 2]!) >
        25
      )
        colored++;
      if (
        Math.abs(first[i]! - last[i]!) +
          Math.abs(first[i + 1]! - last[i + 1]!) +
          Math.abs(first[i + 2]! - last[i + 2]!) >
        50
      )
        changed++;
    }
    return {
      width,
      height,
      frames: samples.length,
      colored,
      changed,
      timestamps: samples.map((frame) => frame.timestamp),
    };
  } finally {
    input.dispose();
  }
}
