import {
  applyMotionFrame,
  compileMotion,
  evaluateMotion,
  type Project,
} from "../../../packages/core/src/index";
import { exportMotionVideo } from "../../../packages/render/src/index";
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";

/** This witness exports the caller's scene channels verbatim; it never adds layer animation. */
export async function encodeSceneMotion(project: Project, forceWebGL = false) {
  const before = JSON.stringify(project);
  const result = await exportMotionVideo(project, {
    compositionId: project.pages[0]!.id,
    frameRate: { numerator: 10, denominator: 1 },
    audio: false,
    forceWebGL,
    maxGpuBytes: 128 * 1024 * 1024,
  });
  if (!result.blob) throw Error("Native scene Motion export produced no file");
  const encoded = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(Error("Missing encoded scene video"));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(result.blob!);
  });
  const program = compileMotion(project, { compositionId: project.pages[0]!.id });
  const light = applyMotionFrame(program, evaluateMotion(program, { value: 45, rate: 100 }))
    .spatial!.lights[0]!;
  const sampledScene = [0, 30, 45, 60, 80].map((value) => {
    const spatial = applyMotionFrame(
      program,
      evaluateMotion(program, { value, rate: 100 }),
    ).spatial!;
    return {
      time: value / 100,
      camera: spatial.camera,
      environment: spatial.environment,
      lights: spatial.lights,
    };
  });
  return {
    encoded,
    frames: result.frameCount,
    mimeType: result.mimeType,
    unchanged: JSON.stringify(project) === before,
    middleLightColor: light.color,
    sampledScene,
  };
}

/** Decode on a separate, uninstrumented inspection page so production readbacks stay measurable. */
export async function inspectSceneMotion(encoded: string) {
  const input = new Input({
    source: new BlobSource(await (await fetch(encoded)).blob()),
    formats: ALL_FORMATS,
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw Error("Scene Motion video has no decoded visual track");
    const width = await track.getDisplayWidth(),
      height = await track.getDisplayHeight();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!;
    const samples: { timestamp: number; pixels: Uint8ClampedArray; image: string }[] = [];
    for await (const sample of new VideoSampleSink(track).samples()) {
      try {
        sample.draw(context, 0, 0);
        samples.push({
          timestamp: sample.timestamp,
          pixels: context.getImageData(0, 0, width, height).data,
          image: canvas.toDataURL("image/png"),
        });
      } finally {
        sample.close();
      }
    }
    const nearest = (time: number) => {
      const sample = samples.reduce<(typeof samples)[number] | undefined>(
        (best, sample) =>
          !best || Math.abs(sample.timestamp - time) < Math.abs(best.timestamp - time)
            ? sample
            : best,
        undefined,
      );
      if (!sample || Math.abs(sample.timestamp - time) > 0.02)
        throw Error(`Missing native video frame at ${time}`);
      return sample.pixels;
    };
    const changes = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
      let changed = 0;
      for (let index = 0; index < a.length; index += 4)
        if (
          Math.abs(a[index]! - b[index]!) +
            Math.abs(a[index + 1]! - b[index + 1]!) +
            Math.abs(a[index + 2]! - b[index + 2]!) >
          45
        )
          changed++;
      return changed;
    };
    const dominant = (pixels: Uint8ClampedArray, channel: 0 | 2) => {
      let count = 0;
      for (let index = 0; index < pixels.length; index += 4)
        if (pixels[index + channel]! > pixels[index + (2 - channel)]! + 25) count++;
      return count;
    };
    const first = nearest(0),
      camera = nearest(0.3),
      light = nearest(0.6),
      environment = nearest(0.8);
    return {
      width,
      height,
      frames: samples.length,
      timestamps: samples.map((sample) => sample.timestamp),
      changes: {
        camera: changes(first, camera),
        light: changes(camera, light),
        environment: changes(light, environment),
      },
      redLightPixels: dominant(camera, 0),
      blueLightPixels: dominant(light, 2),
      images: samples.map((sample) => sample.image),
      perFrame: samples.map(({ timestamp, pixels }) => {
        const sum = [0, 0, 0],
          maximum = [0, 0, 0];
        let maxBlueMinusRed = -255;
        for (let index = 0; index < pixels.length; index += 4) {
          for (let channel = 0; channel < 3; channel++) {
            sum[channel]! += pixels[index + channel]!;
            maximum[channel] = Math.max(maximum[channel]!, pixels[index + channel]!);
          }
          maxBlueMinusRed = Math.max(maxBlueMinusRed, pixels[index + 2]! - pixels[index]!);
        }
        return {
          timestamp,
          redPixels: dominant(pixels, 0),
          bluePixels: dominant(pixels, 2),
          meanRGB: sum.map((value) => value / (width * height)),
          maximumRGB: maximum,
          maxBlueMinusRed,
        };
      }),
    };
  } finally {
    input.dispose();
  }
}
