import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { serializeProject, validateProject, type SceneAsset } from "../../packages/core/src/index";
import { createCornellBox } from "../../apps/web/src/services/projects/templates/motion/cornell-box";
import { cornellRoomGlb } from "./cornell/room";
import type { MotionTemplateManifest } from "../../apps/web/src/services/projects/templates/motion/model";

export async function generateCornellBox(output = "apps/web/public/templates/motion") {
  const bytes = cornellRoomGlb();
  const room: SceneAsset = {
    id: "cornell-room-original",
    kind: "model3d",
    name: "Cornell Box / original procedural room",
    mime: "model/gltf-binary",
    width: 1080,
    height: 1080,
    byteLength: bytes.byteLength,
    dataUrl: `data:model/gltf-binary;base64,${Buffer.from(bytes).toString("base64")}`,
    clips: [],
  };
  const { project, initial, batches } = createCornellBox(room);
  validateProject(project);
  const manifest: MotionTemplateManifest = {
    version: 1,
    templateId: "cornell-box",
    project,
    originals: [],
  };
  await mkdir(output, { recursive: true });
  for (const [extension, data] of [
    ["json", JSON.stringify(manifest)],
    ["musart", serializeProject(project)],
    ["commands.json", JSON.stringify({ version: 1, initial, batches })],
  ])
    await writeFile(resolve(output, `cornell-box.${extension}`), `${data}\n`);
  return manifest;
}
if (import.meta.main) {
  const result = await generateCornellBox();
  console.log(
    `Cornell Box: ${result.project.pages[0]!.layers.length} native 3D layers, 8-second loop.`,
  );
}
