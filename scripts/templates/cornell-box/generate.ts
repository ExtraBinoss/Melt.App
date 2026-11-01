import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { serializeProject, validateProject } from "../../../packages/core/src/index";
import { createCornellBox } from "../../../apps/web/src/services/projects/templates/motion/cornell-box/build";
import type { MotionTemplateManifest } from "../../../apps/web/src/services/projects/templates/motion/model";

export async function generateCornellBox(output = "apps/web/public/templates/motion/cornell-box") {
  const { project, initial, batches } = createCornellBox();
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
    `Cornell Box: ${result.project.pages[0]!.layers.length} editable layers, 8-second camera orbit.`,
  );
}
