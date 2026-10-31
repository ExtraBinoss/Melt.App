import type { VideoAsset } from "../../packages/core/src/index";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { inspectTemplateVideo } from "../templates/media";
import sources from "../../test/performance/video-playback/sources.json";

/** Cache pinned CC0 originals outside Git; preserve native 1080p cadence, codec and bitrate. */
export async function prepareVideoFixtures(directory = "artifacts/video-stress/media") {
  await mkdir(directory, { recursive: true });
  const assets: VideoAsset[] = [];
  for (const [index, source] of sources.entries()) {
    const path = resolve(directory, source.file);
    let file = Bun.file(path);
    if (!(await file.exists())) {
      const response = await fetch(source.url);
      if (!response.ok) throw Error(`Download failed (${response.status}): ${source.name}`);
      if (Number(response.headers.get("content-length")) > 100 * 1024 * 1024)
        throw Error("Video fixture exceeds its 100 MiB download limit.");
      await Bun.write(path, response);
      file = Bun.file(path);
    }
    const digest = new Bun.CryptoHasher("sha256").update(await file.arrayBuffer()).digest("hex");
    if (file.size !== source.bytes || digest !== source.sha256)
      throw Error(`Fixture integrity mismatch: ${source.name}`);
    const video = await inspectTemplateVideo(path);
    if (
      video.width !== 1920 ||
      video.height !== 1080 ||
      video.duration.value / video.duration.rate < 8
    )
      throw Error(
        `The fixture must contain at least eight seconds of native 1080p: ${source.name}`,
      );
    assets.push({
      ...video,
      id: `lab-asset-${index}`,
      kind: "video",
      mime: "video/mp4",
      name: source.name,
      originalId: `lab-${source.sha256}`,
      contentRevision: `sha256:${source.sha256}`,
      byteLength: source.bytes,
    });
    console.info(`${source.name}: 1920 × 1080, ${source.probe.avg_frame_rate} fps, CC0-1.0`);
  }
  return assets;
}
if (import.meta.main) await prepareVideoFixtures(process.argv[2]);
