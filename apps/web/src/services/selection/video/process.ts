import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";
import { motionTimeToSeconds, type VideoAsset } from "@musart/core";
import type { ModelDownloadEvent } from "../model/contract";
import { createPersonMatte } from "./matte";
import { createMatteWriter } from "./encode";
export interface VideoMatteProgress {
  completed: number;
  total: number;
}
/** Native original preparation only. This worker never reads editor/compositor GPU textures. */
export async function removeVideoBackground(
  original: Blob,
  asset: VideoAsset,
  onModel?: (event: ModelDownloadEvent) => void,
  onFrame?: (progress: VideoMatteProgress) => void,
) {
  if (original.size !== asset.byteLength)
    throw Error("The video original changed during background removal.");
  const total = motionTimeToSeconds(asset.duration);
  if (!(total > 0) || total > 600)
    throw Error("Person background removal supports videos up to ten minutes.");
  const input = new Input({
    source: new BlobSource(original, { maxCacheSize: 1024 * 1024 }),
    formats: ALL_FORMATS,
  });
  const scale = Math.min(1, 512 / Math.max(asset.width, asset.height));
  const width = Math.max(2, Math.round((asset.width * scale) / 2) * 2),
    height = Math.max(2, Math.round((asset.height * scale) / 2) * 2);
  const canvas = new OffscreenCanvas(width, height);
  let model: Awaited<ReturnType<typeof createPersonMatte>> | undefined;
  let writer: Awaited<ReturnType<typeof createMatteWriter>> | undefined;
  let finished = false;
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode()))
      throw Error("The source video cannot be decoded in this browser.");
    const start = await track.getFirstTimestamp();
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw Error("Native source-video preparation is unavailable.");
    writer = await createMatteWriter(canvas);
    model = await createPersonMatte(onModel);
    let completed = 0,
      notified = -Infinity,
      frames = 0;
    for await (const sample of new VideoSampleSink(track, { optimizeForLatency: true }).samples()) {
      try {
        const time = sample.timestamp - start;
        if (time < -0.000001 || sample.duration <= 0)
          throw Error("The video has invalid frame timing.");
        sample.draw(context, 0, 0, width, height);
        const alpha = await model.frame(
          context.getImageData(0, 0, width, height).data,
          width,
          height,
        );
        context.putImageData(new ImageData(alpha, width, height), 0, 0);
        await writer.add(Math.max(0, time), sample.duration);
        frames++;
        completed = Math.min(total, time + sample.duration);
        if (performance.now() - notified > 100) {
          onFrame?.({ completed, total });
          notified = performance.now();
        }
      } finally {
        sample.close();
      }
    }
    if (!frames || completed < total - Math.max(0.1, 2 / asset.timeResolution))
      throw Error("The generated mask ended before the source video.");
    const blob = await writer.finish();
    finished = true;
    onFrame?.({ completed: total, total });
    return { blob, width, height };
  } finally {
    input.dispose();
    try {
      if (writer && !finished) await writer.dispose();
    } finally {
      try {
        await model?.dispose();
      } finally {
        canvas.width = canvas.height = 1;
      }
    }
  }
}
