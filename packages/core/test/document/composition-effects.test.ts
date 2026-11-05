import { describe, expect, it } from "vitest";
import { collectProjectIds } from "../../src/document/identity";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  parseProject,
  serializeProject,
  copyContent,
  parseClipboard,
  pasteContent,
} from "../../src/index";

describe("portable composition effects", () => {
  it("accepts legacy absence and roundtrips a validated, ordered global stack with undo/redo", () => {
    const page = createPage({ layers: [createLayer("rectangle")] });
    delete page.effects;
    const engine = new EditorEngine(
      parseProject(serializeProject(createProject({ pages: [page] }))),
    );
    const stack = [createEffect("exposure"), createEffect("grain", { enabled: false })];
    const before = engine.getSnapshot().project;
    engine.execute({ type: "updatePage", patch: { effects: stack } });
    expect(engine.getSnapshot().project.pages[0]!.effects).toEqual(stack);
    expect(collectProjectIds(engine.getSnapshot().project)).toContain(stack[0]!.id);
    expect(parseProject(serializeProject(engine.getSnapshot().project)).pages[0]!.effects).toEqual(
      stack,
    );
    engine.undo();
    expect(engine.getSnapshot().project).toEqual(before);
    engine.redo();
    expect(engine.getSnapshot().project.pages[0]!.effects).toEqual(stack);
  });

  it("rejects invalid values, duplicate IDs, geometry operators and missing image inputs atomically", () => {
    const layer = createLayer("rectangle", { effects: [createEffect("blur")] });
    const engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] }));
    const before = engine.getSnapshot();
    for (const effects of [
      [createEffect("brightness", { amount: 2 })],
      [createEffect("blur", { id: layer.effects[0]!.id })],
      [createEffect("morph")],
      [createEffect("displace", { inputs: { map: "missing" } })],
      Array.from({ length: 65 }, () => createEffect("blur")),
    ]) {
      expect(() => engine.execute({ type: "updatePage", patch: { effects } })).toThrow();
      expect(engine.getSnapshot()).toBe(before);
    }
  });

  it("copies composition input originals and remaps global effect IDs on paste", () => {
    const effect = createEffect("displace", { inputs: { map: "texture" } });
    const project = createProject({
      pages: [createPage({ effects: [effect] })],
      assets: {
        texture: {
          id: "texture",
          name: "map",
          mime: "image/png",
          width: 1,
          height: 1,
          dataUrl: "data:image/png;base64,AA==",
        },
      },
    });
    const engine = new EditorEngine(project);
    const copied = parseClipboard(
      copyContent(engine.getSnapshot(), { composition: true }),
      project,
    );
    expect(copied.document.assets.texture).toEqual(project.assets.texture);
    let id = 0;
    const pasted = pasteContent(copied, project, { x: 0, y: 0 }, () => `paste-${++id}`);
    engine.transaction(pasted.commands);
    const clone = engine.getSnapshot().project.pages[1]!;
    expect(clone.effects?.[0]!.id).not.toBe(effect.id);
    expect(clone.effects?.[0]!.inputs).toEqual(effect.inputs);
    engine.undo();
    expect(engine.getSnapshot().project.pages).toHaveLength(1);
  });
});
