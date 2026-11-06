import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
} from "../../../packages/core/src/index";
import { exportMotionVideo } from "../../../packages/render/src/export/motion/export";

export async function inspectStaticVideo(encoded: string) {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(await (await fetch(encoded)).blob()),
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("No delivered video track");
    const width = await track.getDisplayWidth(),
      height = await track.getDisplayHeight();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!;
    const frames: { red: number; x: number; y: number }[] = [];
    for await (const sample of new VideoSampleSink(track).samples()) {
      try {
        sample.draw(context, 0, 0);
        const pixels = context.getImageData(0, 0, width, height).data;
        let red = 0,
          x = 0,
          y = 0;
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i]! > pixels[i + 1]! + 80 && pixels[i]! > pixels[i + 2]! + 80) {
            const index = i / 4;
            red++;
            x += index % width;
            y += Math.floor(index / width);
          }
        frames.push({ red, x: x / red, y: y / red });
      } finally {
        sample.close();
      }
    }
    return {
      width,
      height,
      frames,
      duration: await track.computeDuration(),
      audio: Boolean(await input.getPrimaryAudioTrack()),
    };
  } finally {
    input.dispose();
  }
}

export async function exportStaticFallback() {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "still",
          width: 64,
          height: 48,
          background: "#0033ff",
          layers: [
            createLayer("rectangle", {
              id: "marker",
              x: 8,
              y: 8,
              width: 16,
              height: 16,
              fill: "#ff0000",
            }),
          ],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  for (const [value, x] of [
    [0, 30],
    [1, 46],
  ])
    engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: "marker", property: "x" },
      time: { value: value!, rate: 1 },
      value: x!,
    });
  engine.execute({ type: "setCompositionMode", mode: "static" });
  const project = engine.getSnapshot().project,
    before = JSON.stringify(project);
  const output = await exportMotionVideo(project, {
    compositionId: "still",
    staticDuration: { value: 1, rate: 2 },
    frameRate: { numerator: 12, denominator: 1 },
    container: "webm",
    forceWebGL: true,
  });
  if (!output.blob) throw new Error("The encoder returned no file");
  const encoded = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Encoded video could not be read as a data URL"));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(output.blob!);
  });
  return {
    encoded,
    unchanged: JSON.stringify(project) === before,
    frames: output.frameCount,
    audio: output.audio,
  };
}
