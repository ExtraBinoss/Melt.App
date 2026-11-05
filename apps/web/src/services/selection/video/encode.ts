import {
  CanvasSource,
  canEncodeVideo,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
  WebMOutputFormat,
} from "mediabunny";
/** Bounded encoded output; backpressure keeps only one matte frame in flight. */
export async function createMatteWriter(canvas: OffscreenCanvas) {
  const { width, height } = canvas;
  const quality = new Quality({ bitrate: 3_000_000, bitrateMode: "variable" });
  const codec = (await canEncodeVideo("avc", { width, height, quality })) ? "avc" : "vp8";
  if (!(await canEncodeVideo(codec, { width, height, quality })))
    throw Error("No native video encoder is available for background removal.");
  const chunks = new Map<number, Uint8Array<ArrayBuffer>>();
  const block = 256 * 1024,
    maxBytes = 96 * 1024 * 1024;
  let length = 0;
  const target = new StreamTarget(
    new WritableStream({
      write(chunk) {
        const end = chunk.position + chunk.data.length;
        if (!Number.isSafeInteger(end) || chunk.position < 0 || end > maxBytes)
          throw Error("The generated video mask exceeds its 96 MiB budget.");
        for (let source = 0; source < chunk.data.length;) {
          const position = chunk.position + source,
            index = Math.floor(position / block),
            offset = position % block;
          let data = chunks.get(index);
          if (!data) {
            data = new Uint8Array(block);
            chunks.set(index, data);
          }
          const size = Math.min(block - offset, chunk.data.length - source);
          data.set(chunk.data.subarray(source, source + size), offset);
          source += size;
        }
        length = Math.max(length, end);
      },
    }),
    { chunked: true, chunkSize: block },
  );
  const output = new Output({
    target,
    format:
      codec === "avc" ? new Mp4OutputFormat({ fastStart: "fragmented" }) : new WebMOutputFormat(),
  });
  const source = new CanvasSource(canvas, { codec, quality, keyFrameInterval: 1 });
  output.addVideoTrack(source);
  try {
    await output.start();
  } catch (error) {
    source.close();
    await output.cancel();
    chunks.clear();
    throw error;
  }
  return {
    add: (timestamp: number, duration: number) => source.add(timestamp, duration),
    async finish() {
      source.close();
      await output.finalize();
      const parts: Uint8Array<ArrayBuffer>[] = [];
      for (let position = 0; position < length; position += block) {
        const data = chunks.get(position / block);
        if (!data) throw Error("The encoded video mask is incomplete.");
        parts.push(data.subarray(0, Math.min(block, length - position)));
      }
      const blob = new Blob(parts, { type: codec === "avc" ? "video/mp4" : "video/webm" });
      chunks.clear();
      return blob;
    },
    async dispose() {
      source.close();
      await output.cancel();
      chunks.clear();
    },
  };
}
