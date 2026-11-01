import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { serializeProject, validateProject } from "../../packages/core/src/index";
import { createTerminalSignal } from "../../apps/web/src/services/projects/templates/motion/terminal-signal";
import type { MotionTemplateManifest } from "../../apps/web/src/services/projects/templates/motion/model";

export async function generateTerminalSignal(output = "apps/web/public/templates/motion") {
  const { project, initial, batches } = createTerminalSignal();
  validateProject(project);
  const manifest: MotionTemplateManifest = {
    version: 1,
    templateId: "terminal-signal",
    project,
    originals: [],
  };
  await mkdir(output, { recursive: true });
  for (const [extension, data] of [
    ["json", JSON.stringify(manifest)],
    ["musart", serializeProject(project)],
    ["commands.json", JSON.stringify({ version: 1, initial, batches })],
  ])
    await writeFile(resolve(output, `terminal-signal.${extension}`), `${data}\n`);
  return manifest;
}
if (import.meta.main) {
  const result = await generateTerminalSignal();
  console.log(
    `Terminal Signal: ${result.project.pages[0]!.layers.length} editable layers; 1080×1920; 16 seconds.`,
  );
}
