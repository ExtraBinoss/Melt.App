import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { serializeProject, validateProject } from "../../../packages/core/src/index";
import { createStudioStarter } from "../../../apps/web/src/services/projects/templates/designed/studio-starter/build";

/** Static native scene authored through the same core command path as the editor. */
export async function generateStudioStarter(
  directory = resolve("apps/web/public/templates/designed/studio-starter"),
): Promise<string[]> {
  const { initial, project, batches } = createStudioStarter();
  validateProject(project);
  await mkdir(directory, { recursive: true });
  const files = {
    "studio-starter.json": JSON.stringify({ version: 1, templateId: "studio-starter", project }),
    "studio-starter.commands.json": JSON.stringify({ version: 1, initial, batches }),
    "studio-starter.musart": serializeProject(project),
  };
  const written: string[] = [];
  for (const [name, contents] of Object.entries(files)) {
    const path = resolve(directory, name);
    await writeFile(path, `${contents}\n`);
    written.push(path);
  }
  return written;
}

if (import.meta.main) for (const path of await generateStudioStarter()) console.log(path);
