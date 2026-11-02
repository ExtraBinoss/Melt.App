import { expect, it } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  serializeProject,
  parseProject,
  selectionComposition,
  validateProject,
} from "../../src/index";
import { copyContent, parseClipboard } from "../../src/clipboard/content";
import { pasteContent } from "../../src/clipboard/paste";
it("moves selected sibling blocks one step with stable order, unchanged transforms and atomic undo", () => {
  const layers = ["a", "b", "c", "d", "e"].map((id) =>
    createLayer("rectangle", { id, x: 17, y: 29 }),
  );
  const engine = new EditorEngine(createProject({ pages: [createPage({ layers })] }));
  engine.select(["b", "c"]);
  const before = engine.getSnapshot();
  engine.execute({ type: "shiftLayers", ids: ["b", "c"], direction: "forward" });
  expect(engine.getSnapshot().project.pages[0]!.layers.map((layer) => layer.id)).toEqual([
    "a",
    "d",
    "b",
    "c",
    "e",
  ]);
  expect(engine.getSnapshot().selection).toEqual(before.selection);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before.project);
  expect(engine.getSnapshot().canUndo).toBe(false);
  engine.execute({ type: "shiftLayers", ids: ["b", "c"], direction: "backward" });
  expect(engine.getSnapshot().project.pages[0]!.layers.map((layer) => layer.id)).toEqual([
    "b",
    "c",
    "a",
    "d",
    "e",
  ]);
  for (const layer of engine.getSnapshot().project.pages[0]!.layers)
    expect([layer.x, layer.y]).toEqual([17, 29]);
});
it("clips multiple layers to the same visible base without replacing their existing masks", () => {
  const base = createLayer("ellipse", { id: "base" }),
    source = createLayer("rectangle", { id: "source", maskSource: true }),
    one = createLayer("rectangle", {
      id: "one",
      mask: { layerId: source.id, enabled: true, inverted: true, mode: "alpha" },
    }),
    two = createLayer("rectangle", { id: "two" });
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ layers: [source, base, one, two] })] }),
  );
  const before = engine.getSnapshot().project;
  engine.execute({ type: "toggleClipping", ids: [one.id, two.id] });
  const clipped = engine.getSnapshot().project;
  expect(clipped.pages[0]!.layers.slice(2).map((layer) => layer.clipping)).toEqual([
    { layerId: "base" },
    { layerId: "base" },
  ]);
  expect(clipped.pages[0]!.layers[1]).toEqual(base);
  expect(clipped.pages[0]!.layers[2]!.mask).toEqual(one.mask);
  expect(parseProject(serializeProject(clipped))).toEqual(clipped);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
  engine.redo();
  expect(engine.getSnapshot().project).toEqual(clipped);
  engine.execute({ type: "toggleClipping", ids: [one.id, two.id] });
  expect(
    engine
      .getSnapshot()
      .project.pages[0]!.layers.slice(2)
      .every((layer) => !layer.clipping),
  ).toBe(true);
});
it("rejects locked, missing-base and cyclic clip edits atomically and releases deleted bases", () => {
  const base = createLayer("rectangle", { id: "base" }),
    top = createLayer("rectangle", { id: "top" });
  const engine = new EditorEngine(createProject({ pages: [createPage({ layers: [base, top] })] }));
  expect(() => engine.execute({ type: "toggleClipping", ids: [base.id] })).toThrow();
  engine.execute({ type: "toggleClipping", ids: [top.id] });
  const before = engine.getSnapshot();
  expect(() =>
    engine.execute({
      type: "updateLayers",
      ids: [base.id],
      patch: { clipping: { layerId: top.id } },
    }),
  ).toThrow();
  expect(engine.getSnapshot()).toBe(before);
  engine.execute({ type: "deleteLayers", ids: [base.id] });
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.clipping).toBeUndefined();
});
it("retains private clipping dependencies across selection export, clipboard paste and duplication", () => {
  const base = createLayer("ellipse", { id: "base", x: 20, y: 30 }),
    top = createLayer("rectangle", { id: "top", clipping: { layerId: base.id } }),
    page = createPage({ layers: [base, top] }),
    engine = new EditorEngine(createProject({ pages: [page] }));
  const isolated = selectionComposition(page, [top.id]);
  validateProject(createProject({ pages: [isolated] }));
  const target = isolated.layers.find((layer) => layer.id === top.id)!,
    dependency = isolated.layers.find((layer) => layer.id === target.clipping!.layerId)!;
  expect(dependency.id).not.toBe(base.id);
  expect(dependency.maskSource).toBe(true);
  engine.select([top.id]);
  const content = parseClipboard(copyContent(engine.getSnapshot()), engine.getSnapshot().project);
  let sequence = 0;
  const paste = pasteContent(
    content,
    engine.getSnapshot().project,
    { x: 100, y: 100 },
    () => `pasted-${++sequence}`,
  );
  engine.transaction(paste.commands);
  engine.select(paste.selection);
  const pasted = engine.getSnapshot(),
    pastedTop = pasted.project.pages[0]!.layers.find((layer) => layer.id === pasted.selection[0])!;
  expect(pastedTop.clipping!.layerId).not.toBe(base.id);
  expect(
    pasted.project.pages[0]!.layers.some((layer) => layer.id === pastedTop.clipping!.layerId),
  ).toBe(true);
  engine.execute({ type: "updateLayers", ids: [pastedTop.id], patch: { mask: null } });
  expect(
    engine
      .getSnapshot()
      .project.pages[0]!.layers.find((layer) => layer.id === pastedTop.clipping!.layerId)!
      .maskSource,
  ).toBe(true);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(pasted.project);
  engine.undo();
  expect(engine.getSnapshot().project.pages[0]!.layers.map((layer) => layer.id)).toEqual([
    base.id,
    top.id,
  ]);
  engine.execute({ type: "duplicateLayers", ids: [base.id, top.id], inPlace: true });
  const duplicated = engine.getSnapshot(),
    copies = duplicated.project.pages[0]!.layers.filter((layer) =>
      duplicated.selection.includes(layer.id),
    );
  expect(copies[1]!.clipping).toEqual({ layerId: copies[0]!.id });
});
it("rejects edits to locked clipping dependents and treated group ungrouping atomically", () => {
  const base = createLayer("rectangle", { id: "base" }),
    top = createLayer("group", { id: "top", clipping: { layerId: base.id }, locked: true }),
    engine = new EditorEngine(createProject({ pages: [createPage({ layers: [base, top] })] }));
  const before = engine.getSnapshot();
  for (const command of [
    { type: "toggleClipping", ids: [top.id] },
    { type: "shiftLayers", ids: [top.id], direction: "backward" },
    { type: "deleteLayers", ids: [base.id] },
  ] as const)
    expect(() => engine.execute({ ...command, ids: [...command.ids] })).toThrow();
  expect(engine.getSnapshot()).toBe(before);
  engine.execute({ type: "updateLayers", ids: [top.id], patch: { locked: false } });
  const unlocked = engine.getSnapshot();
  expect(() => engine.execute({ type: "ungroupLayers", ids: [top.id] })).toThrow();
  expect(engine.getSnapshot()).toBe(unlocked);
});
