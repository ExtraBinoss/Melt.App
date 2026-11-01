import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  serializeProject,
  validateProject,
  type VideoAsset,
} from "../../../packages/core/src/index";
import { createSecondSkin } from "../../../apps/web/src/services/projects/templates/motion/second-skin/build";
import type { MotionTemplateManifest } from "../../../apps/web/src/services/projects/templates/motion/model";
import { inspectTemplateVideo } from "../media";
import { SECOND_SKIN_MEDIA as media } from "./source";

export async function generateSecondSkin(output = "apps/web/public/templates/motion/second-skin") {
  const data = await readFile(resolve(output, "media", media.file));
  const digest = createHash("sha256").update(data).digest("hex");
  if (
    data.byteLength !== media.bytes ||
    digest !== media.sha256 ||
    data.byteLength > 8 * 1024 * 1024
  )
    throw Error("Second Skin media integrity mismatch.");
  const video: VideoAsset = {
    id: "skin-video",
    kind: "video",
    name: media.attribution,
    mime: "video/mp4",
    originalId: `second-skin-${digest}`,
    contentRevision: `sha256:${digest}`,
    byteLength: data.byteLength,
    ...(await inspectTemplateVideo(resolve(output, "media", media.file))),
  };
  if (
    video.width !== media.width ||
    video.height !== media.height ||
    video.duration.value / video.duration.rate !== media.duration
  )
    throw Error("Unexpected Second Skin media metadata.");
  const { initial, project, batches } = createSecondSkin({ video, photos: [] });
  validateProject(project);
  const manifest: MotionTemplateManifest = {
    version: 1,
    templateId: "second-skin",
    project,
    originals: [
      {
        originalId: video.originalId,
        contentRevision: video.contentRevision,
        file: `second-skin/media/${media.file}`,
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
    await writeFile(resolve(output, `second-skin.${extension}`), contents + "\n");
  return manifest;
}
if (import.meta.main)
  console.log(
    `Second Skin: ${(await generateSecondSkin()).project.pages[0]!.layers.length} editable layers.`,
  );
