import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  serializeProject,
  validateProject,
  type VideoAsset,
} from "../../../packages/core/src/index";
import { createBloomWindows } from "../../../apps/web/src/services/projects/templates/motion/bloom-windows/build";
import type { MotionTemplateManifest } from "../../../apps/web/src/services/projects/templates/motion/model";
import { inspectTemplateVideo } from "../media";

/** Rebuild the editable bundle from the pinned, locally bundled loop original. */
export async function generateBloomWindows(
  output = "apps/web/public/templates/motion/bloom-windows",
  mediaDirectory = "apps/web/public/templates/motion/media",
) {
  const source = JSON.parse(
    await readFile(resolve(mediaDirectory, "bloom-windows-source.json"), "utf8"),
  ) as {
    file: string;
    sha256: string;
    bytes: number;
    width: number;
    height: number;
    preview: { file: string; sha256: string; bytes: number };
  };
  if (source.file !== "bloom-windows-loop.mp4") throw Error("Unexpected bloom source path.");
  const path = resolve(mediaDirectory, source.file);
  const data = await readFile(path);
  const digest = createHash("sha256").update(data).digest("hex");
  if (data.byteLength !== source.bytes || digest !== source.sha256)
    throw Error("Bloom source integrity mismatch.");
  const video: VideoAsset = {
    id: "bw-bloom-original",
    kind: "video",
    name: "Rose blooming / seamless original",
    mime: "video/mp4",
    originalId: `bloom-windows-${digest}`,
    contentRevision: `sha256:${digest}`,
    byteLength: data.byteLength,
    ...(await inspectTemplateVideo(path)),
  };
  if (
    video.width !== 1920 ||
    video.height !== 1080 ||
    video.duration.value / video.duration.rate !== 12
  )
    throw Error("Bloom Windows requires the 12-second 1080p loop.");
  const { initial, project, batches } = createBloomWindows({ video, photos: [] });
  validateProject(project);
  const manifest: MotionTemplateManifest = {
    version: 1,
    templateId: "bloom-windows",
    project,
    originals: [
      {
        originalId: video.originalId,
        contentRevision: video.contentRevision,
        file: `media/${source.file}`,
        byteLength: video.byteLength,
        mime: video.mime,
      },
    ],
  };
  await mkdir(output, { recursive: true });
  for (const [extension, contents] of [
    ["json", JSON.stringify(manifest)],
    ["musart", serializeProject(project)],
    ["commands.json", JSON.stringify({ version: 1, initial, batches })],
  ])
    await writeFile(resolve(output, `bloom-windows.${extension}`), `${contents}\n`);
  if (source.preview.file !== "bloom-windows-hover.mp4") throw Error("Unexpected preview path.");
  const previewPath = resolve(mediaDirectory, source.preview.file);
  const previewBytes = await readFile(previewPath);
  const previewDigest = createHash("sha256").update(previewBytes).digest("hex");
  if (previewDigest !== source.preview.sha256 || previewBytes.byteLength !== source.preview.bytes)
    throw Error("Bloom preview integrity mismatch.");
  const previewVideo: VideoAsset = {
    ...video,
    ...(await inspectTemplateVideo(previewPath)),
    originalId: `bloom-windows-hover-${previewDigest}`,
    contentRevision: `sha256:${previewDigest}`,
    byteLength: previewBytes.byteLength,
  };
  if (
    previewVideo.width !== 480 ||
    previewVideo.height !== 270 ||
    previewVideo.duration.value / previewVideo.duration.rate !== 12
  )
    throw Error("Bloom hover requires the 480 × 270 twelve-second derivative.");
  const previewProject = { ...project, assets: { [video.id]: previewVideo } };
  validateProject(previewProject);
  const preview: MotionTemplateManifest = {
    ...manifest,
    project: previewProject,
    originals: [
      {
        originalId: previewVideo.originalId,
        contentRevision: previewVideo.contentRevision,
        file: `media/${source.preview.file}`,
        byteLength: previewVideo.byteLength,
        mime: previewVideo.mime,
      },
    ],
  };
  await writeFile(resolve(output, "bloom-windows.preview.json"), `${JSON.stringify(preview)}\n`);
  return manifest;
}

if (import.meta.main) {
  const manifest = await generateBloomWindows();
  console.log(`Bloom Windows: ${manifest.project.pages[0]!.layers.length} editable layers, 1080p.`);
}
