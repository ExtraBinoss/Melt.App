import { readFile, writeFile, stat } from "node:fs/promises";
import {
  ALL_FORMATS,
  BufferSource,
  BufferTarget,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
} from "mediabunny";

/** Reuse the first AVC key packet at the quiet seam: identical decoded endpoint pixels. */
export async function closeBloomLoop(inputPath: string, outputPath: string, expectedFrames = 360) {
  if (!Number.isSafeInteger(expectedFrames) || expectedFrames < 1 || expectedFrames > 600)
    throw Error("Invalid bloom frame bound.");
  if ((await stat(inputPath)).size > 8 * 1024 * 1024) throw Error("Bloom input exceeds 8 MiB.");
  const input = new Input({
    source: new BufferSource(await readFile(inputPath)),
    formats: ALL_FORMATS,
  });
  let output: Output | undefined;
  let finalized = false;
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || (await track.getCodec()) !== "avc")
      throw Error("Expected the prepared AVC bloom loop.");
    const config = await track.getDecoderConfig();
    if (!config) throw Error("Missing AVC decoder configuration.");
    const packets = [];
    for await (const packet of new EncodedPacketSink(track).packets()) {
      packets.push(packet);
      if (packets.length > expectedFrames) throw Error("Bloom input exceeds its frame bound.");
    }
    if (packets.length !== expectedFrames || packets[0]?.type !== "key")
      throw Error("Expected the complete bloom frames and an initial key frame.");
    const target = new BufferTarget();
    const source = new EncodedVideoPacketSource("avc");
    output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
    output.addVideoTrack(source, { frameRate: 30 });
    await output.start();
    for (let index = 0; index < packets.length; index++) {
      const packet = index >= packets.length - 6 ? packets[0]! : packets[index]!;
      await source.add(
        packet.clone({ timestamp: index / 30, duration: 1 / 30, sequenceNumber: index }),
        index === 0 ? { decoderConfig: config } : undefined,
      );
    }
    source.close();
    await output.finalize();
    finalized = true;
    if (!target.buffer || target.buffer.byteLength > 8 * 1024 * 1024)
      throw Error("Prepared bloom exceeds the original budget.");
    await writeFile(outputPath, new Uint8Array(target.buffer));
  } catch (error) {
    if (!finalized) await output?.cancel();
    throw error;
  } finally {
    input.dispose();
  }
}

if (import.meta.main) {
  const [source, destination] = process.argv.slice(2);
  if (!source || !destination)
    throw Error("Usage: bun scripts/templates/bloom-loop.ts <encoded-loop.mp4> <closed-loop.mp4>");
  await closeBloomLoop(source, destination);
}
