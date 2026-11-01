import { ANGEL_SOURCE } from "./angel-source";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { serializeProject, validateProject, type Asset } from "../../packages/core/src/index";
import { createAngelWindows } from "../../apps/web/src/services/projects/templates/motion/angel-windows";
import type { MotionTemplateManifest } from "../../apps/web/src/services/projects/templates/motion/model";

export async function generateAngelWindows(output = "apps/web/public/templates/motion") {
  const input = await readFile(resolve(output, "media/angel-source.glb"));
  const modelBytes = input;
  const model: Asset = {
    id: "angel-original",
    name: "Engel / noe-3d.at · CC BY 4.0",
    kind: "model3d",
    mime: "model/gltf-binary",
    width: 1080,
    height: 1920,
    byteLength: modelBytes.byteLength,
    dataUrl: `data:model/gltf-binary;base64,${Buffer.from(modelBytes).toString("base64")}`,
  };
  const { initial, project, batches } = createAngelWindows(model);
  validateProject(project);
  const manifest: MotionTemplateManifest = {
    version: 1,
    templateId: "angel-windows",
    project,
    originals: [],
  };
  await mkdir(output, { recursive: true });
  for (const [extension, data] of [
    ["json", JSON.stringify(manifest)],
    ["musart", serializeProject(project)],
    ["commands.json", JSON.stringify({ version: 1, initial, batches })],
  ])
    await writeFile(resolve(output, `angel-windows.${extension}`), `${data}\n`);
  await writeFile(
    resolve(output, "media/angel-source.json"),
    `${JSON.stringify({ ...ANGEL_SOURCE, sha256: createHash("sha256").update(input).digest("hex"), bytes: input.byteLength, modifications: "Kept LOD2 geometry, removed other LODs/textures/UVs, packed 16-bit indices." }, null, 2)}\n`,
  );
  return manifest;
}
if (import.meta.main) {
  const result = await generateAngelWindows();
  console.log(
    `Angel.exe: ${result.project.pages[0]!.layers.length} editable layers, 1080 × 1920, 12.8 seconds.`,
  );
}
