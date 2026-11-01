import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import {
  createProject,
  createPage,
  createLayer,
  createEffect,
  projectContentTags,
} from "../../../packages/core/src/index";
import { readTemplateContents } from "../../../scripts/vite/template-contents";
import { TEMPLATE_CATALOG } from "../../../apps/web/src/services/projects/templates/catalog";
import { templateContentTags } from "../../../apps/web/src/services/projects/templates/contents";

test("build metadata follows documents rather than template IDs and contains no embedded originals", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "melt-contents-"));
  try {
    const folder = resolve(directory, "any-new-template");
    mkdirSync(folder);
    const file = resolve(folder, "any-new-template.json");
    const project = createProject({
      pages: [
        createPage({ layers: [createLayer("ellipse", { effects: [createEffect("ripple")] })] }),
      ],
    });
    const write = () =>
      writeFileSync(
        file,
        JSON.stringify({
          templateId: "any-new-template",
          project,
          originals: [{ dataUrl: "large-original" }],
        }),
      );
    write();
    const watched: string[] = [];
    const metadata = readTemplateContents(directory, (path) => watched.push(path));
    expect(watched).toEqual([file]);
    expect(metadata["any-new-template"]).toEqual(projectContentTags(project));
    expect(JSON.stringify(metadata)).not.toMatch(/large-original|pages|assets/);
    project.pages[0]!.layers[0]!.effects = [createEffect("blur")];
    write();
    expect(readTemplateContents(directory)["any-new-template"]).toEqual([
      "effect:blur",
      "layer:ellipse",
    ]);
    writeFileSync(file, JSON.stringify({ templateId: "wrong", project }));
    expect(() => readTemplateContents(directory)).toThrow("Invalid template content manifest");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("every listed template has generated contents and blank formats advertise an empty canvas", () => {
  const generated = readTemplateContents(resolve("apps/web/public/templates/motion"));
  for (const template of TEMPLATE_CATALOG) {
    const expected = template.id.startsWith("preset:") ? ["feature:blank"] : generated[template.id];
    expect(expected, template.id).toBeDefined();
    expect(templateContentTags(template.id)).toEqual(expected);
  }
  expect(templateContentTags("removed-template")).toBeUndefined();
});
