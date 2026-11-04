import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";
import type { VideoAsset } from "@musart/core";
export async function videoPoster(original: Blob, asset: VideoAsset) {
  const input = new Input({
    source: new BlobSource(original, { maxCacheSize: 1024 * 1024 }),
    formats: ALL_FORMATS,
  });
  const scale = Math.min(1, 128 / Math.max(asset.width, asset.height));
  const width = Math.max(1, Math.round(asset.width * scale)),
    height = Math.max(1, Math.round(asset.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode()))
      throw Error("The source video cannot be decoded in this browser.");
    const sample = await new VideoSampleSink(track).getSample(await track.getFirstTimestamp());
    if (!sample) throw Error("The video has no first frame.");
    try {
      const context = canvas.getContext("2d");
      if (!context) throw Error("Video thumbnail preparation is unavailable.");
      sample.draw(context, 0, 0, width, height);
      return { blob: await canvas.convertToBlob({ type: "image/png" }), width, height };
    } finally {
      sample.close();
    }
  } finally {
    input.dispose();
    canvas.width = canvas.height = 1;
  }
}
