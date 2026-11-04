import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { projectContentTags } from "../../packages/core/src/document/contents.ts";
import type { Project } from "../../packages/core/src/document/model.ts";

export const TEMPLATE_CONTENTS_MODULE = "virtual:template-contents";
const resolved = `\0${TEMPLATE_CONTENTS_MODULE}`;

/** Derive tiny client metadata at build time; no document or embedded original enters the gallery bundle. */
export function readTemplateContents(directory: string, watch: (file: string) => void = () => {}) {
  const result: Record<string, ReturnType<typeof projectContentTags>> = {};
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = resolve(directory, entry.name, `${entry.name}.json`);
    if (!existsSync(file)) continue;
    watch(file);
    const manifest = JSON.parse(readFileSync(file, "utf8")) as {
      templateId: string;
      project: Project;
    };
    if (manifest.templateId !== entry.name || !Array.isArray(manifest.project?.pages))
      throw new Error(`Invalid template content manifest: ${file}`);
    result[entry.name] = projectContentTags(manifest.project);
  }
  return result;
}

export function templateContentsPlugin(
  directories: string | readonly string[] = [
    resolve("apps/web/public/templates/motion"),
    resolve("apps/web/public/templates/designed"),
  ],
): Plugin {
  const roots = typeof directories === "string" ? [directories] : directories;
  return {
    name: "melt-template-contents",
    resolveId(id) {
      if (id === TEMPLATE_CONTENTS_MODULE) return resolved;
    },
    load(id) {
      if (id !== resolved) return;
      const content = Object.assign(
        {},
        ...roots.map((directory) =>
          readTemplateContents(directory, (file) => this.addWatchFile(file)),
        ),
      );
      return `export default ${JSON.stringify(content)};`;
    },
    handleHotUpdate({ file, server }) {
      if (!roots.some((directory) => file.startsWith(`${directory}/`)) || !file.endsWith(".json"))
        return;
      const module = server.moduleGraph.getModuleById(resolved);
      if (module) return [module];
    },
  };
}
