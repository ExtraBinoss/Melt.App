import { expect, it } from "vitest";
import {
  createLayer,
  createProject,
  createPage,
  EditorEngine,
  createLayerGeometryIndex,
  getWorldMatrix,
  getWorldBounds,
  transformPoint,
  hitTest,
  parseProject,
  serializeProject,
  selectionComposition,
  validateProject,
  type Matrix,
  type Layer,
} from "../../src/index";
import { setup, box } from "../support/fixture";

function close(actual: Matrix, expected: Matrix) {
  expect(actual).toHaveLength(6);
  for (let i = 0; i < 6; i++) expect(actual[i]).toBeCloseTo(expected[i]!, 9);
}
function parent(patch: Partial<Layer> = {}) {
  return createLayer("group", {
    id: "group",
    x: 100,
    y: 80,
    width: 200,
    height: 200,
    scaleX: 2,
    scaleY: 1.5,
    ...patch,
  });
}

for (const operation of ["ungroup", "reparent"] as const)
  it(`preserves all six coefficients of the reviewed scale-loss case on ${operation}`, () => {
    const { engine, page } = setup([
      parent(),
      box("child", 20, 30, { parentId: "group", width: 40, height: 50 }),
    ]);
    const before = getWorldMatrix(page(), "child");
    expect(before).toEqual([2, 0, 0, 1.5, 40, 75]);
    engine.execute(
      operation === "ungroup"
        ? { type: "ungroupLayers", ids: ["group"] }
        : { type: "reorderLayer", id: "child", index: 0, parentId: null },
    );
    close(getWorldMatrix(page(), "child"), before);
    engine.undo();
    close(getWorldMatrix(page(), "child"), before);
    expect(page().layers.find((layer) => layer.id === "child")!.parentId).toBe("group");
    engine.redo();
    close(getWorldMatrix(page(), "child"), before);
    const restored = parseProject(serializeProject(engine.getSnapshot().project));
    close(getWorldMatrix(restored.pages[0]!, "child"), before);
    expect(restored.version).toBe(1);
  });

it("retains existing residuals through nested mirrored/sheared groups and destination frames", () => {
  const { engine, page } = setup([
    parent({ rotation: 31, affine: [-1, 0.2, 0.4, 1] }),
    createLayer("group", {
      id: "inner",
      parentId: "group",
      x: 15,
      y: 25,
      width: 140,
      height: 120,
      rotation: -22,
      scaleX: 0.6,
      scaleY: 1.8,
      affine: [1, 0.25, 0.1, 1],
    }),
    box("child", 20, 30, {
      parentId: "inner",
      width: 40,
      height: 30,
      rotation: 19,
      scaleX: 1.3,
      affine: [-1, 0, 0.35, 1],
    }),
    createLayer("group", {
      id: "destination",
      x: -30,
      y: 10,
      width: 900,
      height: 700,
      rotation: 48,
      scaleX: 2.1,
      scaleY: 0.8,
      affine: [1, 0.2, -0.4, -1],
    }),
  ]);
  const before = getWorldMatrix(page(), "child");
  engine.execute({ type: "ungroupLayers", ids: ["group"] });
  close(getWorldMatrix(page(), "child"), before);
  engine.execute({ type: "ungroupLayers", ids: ["inner"] });
  close(getWorldMatrix(page(), "child"), before);
  engine.execute({ type: "reorderLayer", id: "child", index: 0, parentId: "destination" });
  close(getWorldMatrix(page(), "child"), before);
  engine.execute({ type: "reorderLayer", id: "child", index: 1, parentId: null });
  close(getWorldMatrix(page(), "child"), before);
  validateProject(engine.getSnapshot().project);
});

it("keeps masked source/target placement, indexed selection bounds and both picking paths", () => {
  const { engine, page } = setup([
    parent({ rotation: 27, affine: [-1, 0.1, 0.7, 1] }),
    box("child", 20, 30, {
      parentId: "group",
      width: 40,
      height: 50,
      mask: { layerId: "mask", enabled: true, inverted: false },
    }),
    createLayer("ellipse", {
      id: "mask",
      parentId: "group",
      x: 22,
      y: 32,
      width: 35,
      height: 45,
      maskSource: true,
    }),
  ]);
  const before = ["child", "mask"].map((id) => getWorldMatrix(page(), id));
  const expectedBounds = getWorldBounds(page(), "child");
  const selectionBefore = selectionComposition(page(), ["child"]);
  engine.execute({ type: "ungroupLayers", ids: ["group"] });
  ["child", "mask"].forEach((id, i) => close(getWorldMatrix(page(), id), before[i]!));
  const geometry = createLayerGeometryIndex(page());
  expect(geometry.worldBounds("child")).toEqual(getWorldBounds(page(), "child"));
  for (const key of ["x", "y", "width", "height"] as const) {
    expect(geometry.worldBounds("child")[key]).toBeCloseTo(expectedBounds[key], 9);
    expect(geometry.collectiveBounds(["child"])![key]).toBeCloseTo(expectedBounds[key], 9);
  }
  const point = transformPoint(before[0]!, { x: 20, y: 25 });
  expect(geometry.hitTest(point)?.id).toBe("child");
  expect(hitTest(page(), point)?.id).toBe("child");
  const selectionAfter = selectionComposition(page(), ["child"]);
  expect([selectionAfter.width, selectionAfter.height]).toEqual([
    selectionBefore.width,
    selectionBefore.height,
  ]);
  close(getWorldMatrix(selectionAfter, "child"), getWorldMatrix(selectionBefore, "child"));
  validateProject(createProject({ pages: [selectionAfter] }));
});

it("does not use identity fast paths or the old unscaled culling radius for a residual basis", () => {
  const { page } = setup([box("wide", 0, 0, { affine: [5, 0, 4, -1] })]);
  const geometry = createLayerGeometryIndex(page());
  const point = transformPoint(getWorldMatrix(page(), "wide"), { x: 95, y: 75 });
  expect(geometry.hitTest(point)?.id).toBe("wide");
  expect(geometry.worldBounds("wide").width).toBe(820);
  expect(geometry.collectiveBounds(["wide"])!.width).toBe(820);
});

it("keeps unextended legacy documents byte-compatible and handles identity reorders", () => {
  const project = createProject({ pages: [createPage({ layers: [box("legacy")] })] });
  const encoded = serializeProject(project);
  expect(encoded).not.toContain('"affine"');
  expect(serializeProject(parseProject(encoded))).toBe(encoded);
  const engine = new EditorEngine(project);
  engine.execute({ type: "reorderLayer", id: "legacy", index: 0, parentId: null });
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.affine).toBeUndefined();
});

it("rejects malformed, singular and out-of-range bases atomically, including a transaction", () => {
  const { engine } = setup([parent(), box("child", 20, 30, { parentId: "group" })]);
  const before = engine.getSnapshot();
  for (const affine of [
    [1, 0, 0],
    [1, 0, 0, 1, 0],
    [1, 2, 2, 4],
    [1, 0, 0, NaN],
    [1e7, 0, 0, 1],
  ]) {
    expect(() =>
      engine.execute({
        type: "updateLayers",
        ids: ["child"],
        patch: { affine: affine as unknown as Layer["affine"] },
      }),
    ).toThrow();
    expect(engine.getSnapshot()).toBe(before);
  }
  expect(() =>
    engine.execute({
      type: "updateLayers",
      ids: ["child"],
      patch: { scaleX: 0.001, scaleY: 0.001, affine: [0.0001, 0, 0, 0.0001] },
    }),
  ).toThrow();
  expect(engine.getSnapshot()).toBe(before);
  expect(() =>
    engine.transaction([
      { type: "ungroupLayers", ids: ["group"] },
      { type: "updateLayers", ids: ["child"], patch: { affine: [0, 0, 0, 0] } },
    ]),
  ).toThrow();
  expect(engine.getSnapshot()).toBe(before);
  expect(before.canUndo).toBe(false);
});

it("rejects an affine hierarchy result that exceeds portable bounds without publishing", () => {
  const { engine } = setup([
    parent({ scaleX: 100, affine: [1e6, 0, 0, 1] }),
    box("child", 30, 30, { parentId: "group", width: 10, height: 10 }),
  ]);
  const before = engine.getSnapshot();
  expect(() => engine.execute({ type: "ungroupLayers", ids: ["group"] })).toThrow();
  expect(engine.getSnapshot()).toBe(before);
});

it("preserves group mask/source rejection and history when the group cannot be dissolved", () => {
  for (const group of [
    parent({ mask: { layerId: "mask", enabled: true, inverted: false } }),
    parent({ maskSource: true }),
  ]) {
    const { engine } = setup([
      group,
      box("child", 20, 30, { parentId: "group" }),
      box("mask", 10, 10, { maskSource: true }),
      box("target", 300, 300, {
        mask: group.maskSource ? { layerId: "group", enabled: true, inverted: false } : null,
      }),
    ]);
    const before = engine.getSnapshot();
    expect(() => engine.execute({ type: "ungroupLayers", ids: ["group"] })).toThrow("Retirez");
    expect(engine.getSnapshot()).toBe(before);
    expect(engine.getSnapshot().canUndo).toBe(false);
  }
});
