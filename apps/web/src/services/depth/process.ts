import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";
import { motionTimeToSeconds, type VideoAsset } from "@musart/core";
import type { ModelDownloadEvent } from "../selection/model/contract";
import { createMatteWriter } from "../selection/video/encode";
import { createDepthModel } from "./inference";
export async function prepareDepth(
  original: Blob,
  video: VideoAsset | undefined,
  modelProgress: (event: ModelDownloadEvent) => void,
  frameProgress: (fraction: number) => void,
  beforeFrame: () => Promise<void> = () => Promise.resolve(),
  preparedModel?: Awaited<ReturnType<typeof createDepthModel>>,
) {
  const duration = video ? motionTimeToSeconds(video.duration) : 0;
  if (video && (duration <= 0 || duration > 60 || original.size !== video.byteLength)) {
    await preparedModel?.dispose();
    throw Error("Depth preparation supports intact videos up to 60 seconds.");
  }
  const model = preparedModel ?? (await createDepthModel(modelProgress, beforeFrame));
  let input: Input | undefined, bitmap: ImageBitmap | undefined;
  let writer: Awaited<ReturnType<typeof createMatteWriter>> | undefined,
    finished = false;
  const canvas = new OffscreenCanvas(2, 2);
  try {
    let width: number, height: number;
    if (video) {
      width = video.width;
      height = video.height;
    } else {
      bitmap = await createImageBitmap(original);
      width = bitmap.width;
      height = bitmap.height;
    }
    if (!(width > 0 && height > 0) || width * height > 40_000_000)
      throw Error("Unsupported source dimensions.");
    const scale = 224 / Math.max(width, height);
    canvas.width = Math.max(14, Math.round((width * scale) / 14) * 14);
    canvas.height = Math.max(14, Math.round((height * scale) / 14) * 14);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw Error("Worker image preparation is unavailable.");
    const infer = async () => {
      await beforeFrame();
      const image = await model.frame(
        context.getImageData(0, 0, canvas.width, canvas.height).data,
        canvas.width,
        canvas.height,
      );
      if (image.width !== canvas.width || image.height !== canvas.height)
        throw Error("Unexpected DA3 output dimensions.");
      context.putImageData(image, 0, 0);
    };
    if (bitmap) {
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      await infer();
      return {
        blob: await canvas.convertToBlob({ type: "image/png" }),
        width: canvas.width,
        height: canvas.height,
      };
    }
    input = new Input({
      source: new BlobSource(original, { maxCacheSize: 1024 * 1024 }),
      formats: ALL_FORMATS,
    });
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw Error("Cannot decode source video.");
    const start = await track.getFirstTimestamp();
    writer = await createMatteWriter(canvas);
    let end = 0,
      count = 0;
    for await (const sample of new VideoSampleSink(track, { optimizeForLatency: true }).samples()) {
      try {
        const time = sample.timestamp - start;
        if (time < -0.000001 || sample.duration <= 0) throw Error("Invalid video timing.");
        sample.draw(context, 0, 0, canvas.width, canvas.height);
        await infer();
        await writer.add(Math.max(0, time), sample.duration);
        end = time + sample.duration;
        count++;
        frameProgress(Math.min(1, end / duration));
      } finally {
        sample.close();
      }
    }
    if (!count || end < duration - 0.1) throw Error("Depth clip ended before its source.");
    const blob = await writer.finish();
    finished = true;
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    input?.dispose();
    bitmap?.close();
    try {
      if (writer && !finished) await writer.dispose();
    } finally {
      await model.dispose();
      canvas.width = canvas.height = 1;
    }
  }
}
