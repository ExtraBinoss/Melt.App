import { expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALL_FORMATS, BufferSource, EncodedPacketSink, Input } from "mediabunny";
import { closeBloomLoop } from "../../../scripts/templates/bloom-windows/loop";

test("closes the real source with identical key packet endpoints and exact natural-speed timing", async () => {
  const folder = await mkdtemp(join(tmpdir(), "melt-bloom-loop-"));
  try {
    const source = "apps/web/public/templates/motion/media/bloom-windows-loop.mp4";
    const destination = join(folder, "closed.mp4");
    await expect(closeBloomLoop(source, destination, 0)).rejects.toThrow("frame bound");
    await closeBloomLoop(source, destination);
    const input = new Input({
      source: new BufferSource(await readFile(destination)),
      formats: ALL_FORMATS,
    });
    try {
      const track = await input.getPrimaryVideoTrack();
      expect(track).not.toBeNull();
      const packets = [];
      for await (const packet of new EncodedPacketSink(track!).packets()) packets.push(packet);
      expect(packets).toHaveLength(360);
      expect(packets[0]!.type).toBe("key");
      expect(packets.at(-1)!.data).toEqual(packets[0]!.data);
      expect(packets.at(-1)!.timestamp + packets.at(-1)!.duration).toBeCloseTo(12, 6);
      expect(
        packets.every((packet, index) => Math.abs(packet.timestamp - index / 30) < 0.000001),
      ).toBe(true);
    } finally {
      input.dispose();
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
