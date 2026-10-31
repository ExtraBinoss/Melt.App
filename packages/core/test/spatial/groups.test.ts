import { expect, test } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
  EditorEngine,
  SpatialGeometry,
  parseProject,
  serializeProject,
  selectionComposition,
  validateProject,
  createLayerGeometryIndex,
  transformSpatial,
  planMotionInitialization,
  compileMotion,
  applyMotionFrame,
  evaluateMotion,
} from "../../src/index";
function fixture() {
  const scene = createSpatialScene();
  scene.camera.yaw = 0;
  scene.camera.pitch = 0;
  return createProject({
    pages: [
      createPage({
        id: "page",
        width: 800,
        height: 600,
        spatial: scene,
        layers: [
          createLayer("rectangle", {
            id: "a",
            x: 50,
            y: 100,
            width: 240,
            height: 180,
            spatial: { ...createSpatialLayer("box"), z: 0.2 },
          }),
          createLayer("text", {
            id: "b",
            x: 360,
            y: 200,
            width: 300,
            height: 120,
            text: "Melt",
            spatial: createSpatialLayer("extrude"),
          }),
        ],
      }),
    ],
  });
}
const matrices = (page: ReturnType<typeof createPage>) => {
  const geometry = new SpatialGeometry(page);
  return ["a", "b"].map((id) => [...geometry.worldMatrix(id)]);
};
function close(actual: number[][], expected: number[][]) {
  for (let i = 0; i < actual.length; i++)
    for (let j = 0; j < 16; j++) expect(actual[i]![j]).toBeCloseTo(expected[i]![j]!, 8);
}
test("native grouping preserves world placement, transforms children together and ungroups affine transforms losslessly", () => {
  const engine = new EditorEngine(fixture());
  const page = () => engine.getSnapshot().project.pages[0]!;
  const before = matrices(page());
  engine.execute({ type: "groupLayers", ids: ["a", "b"] });
  const id = engine.getSnapshot().selection[0]!,
    group = page().layers.find((l) => l.id === id)!;
  expect(group.spatial?.source).toBe("group");
  close(matrices(page()), before);
  engine.execute({
    type: "updateLayers",
    ids: [id],
    patch: {
      spatial: {
        ...group.spatial!,
        rotationY: 43,
        rotationX: 18,
        scaleX: 1.8,
        scaleY: 0.7,
        z: 0.25,
      },
    },
  });
  const moved = matrices(page());
  expect(moved).not.toEqual(before);
  engine.execute({ type: "ungroupLayers", ids: [id] });
  close(matrices(page()), moved);
  expect(page().layers.every((l) => l.parentId === null)).toBe(true);
  const restored = parseProject(serializeProject(engine.getSnapshot().project));
  close(matrices(restored.pages[0]!), moved);
  engine.undo();
  close(matrices(page()), moved);
  expect(page().layers.some((l) => l.spatial?.source === "group")).toBe(true);
  engine.undo();
  close(matrices(page()), before);
  engine.redo();
  close(matrices(page()), moved);
});
test("nested native groups preserve affine bases and fixed child key values", () => {
  const engine = new EditorEngine(fixture()),
    page = () => engine.getSnapshot().project.pages[0]!;
  engine.execute({ type: "groupLayers", ids: ["a", "b"] });
  const inner = engine.getSnapshot().selection[0]!;
  engine.execute({
    type: "updateLayers",
    ids: [inner],
    patch: {
      spatial: { ...page().layers.find((l) => l.id === inner)!.spatial!, rotationZ: 31, scaleY: 2 },
    },
  });
  engine.execute({ type: "groupLayers", ids: [inner] });
  const outer = engine.getSnapshot().selection[0]!;
  engine.execute({
    type: "updateLayers",
    ids: [outer],
    patch: {
      spatial: {
        ...page().layers.find((l) => l.id === outer)!.spatial!,
        rotationY: 61,
        scaleX: 0.8,
      },
    },
  });
  const expected = matrices(page());
  engine.execute({ type: "ungroupLayers", ids: [outer] });
  close(matrices(page()), expected);
  engine.execute({ type: "ungroupLayers", ids: [inner] });
  close(matrices(page()), expected);
});
test("selection crops preserve world matrices, camera gate and shading-only neighbours", () => {
  const page = fixture().pages[0]!,
    expected = matrices(page);
  const cropped = selectionComposition(page, ["a"]);
  expect(cropped.layers.find((l) => l.id === "b")?.spatialContext).toBe(true);
  close(matrices(cropped), expected);
  expect(cropped.spatial?.viewport).toMatchObject({ width: 800, height: 600 });
  const centered = selectionComposition(page, ["a"], [], { centerInArtboard: true });
  close(matrices(centered), expected);
  expect(centered.width).toBe(800);
  validateProject(createProject({ pages: [cropped] }));
  const bounds = createLayerGeometryIndex(page).worldBounds("a");
  expect(bounds.width).toBeGreaterThan(0);
  const origin = transformSpatial(new SpatialGeometry(page).worldMatrix("a"), [0, 0, 0]);
  expect(origin).toHaveLength(4);
});
test("singular/nonaffine bases and non-group group sources reject atomically", () => {
  const engine = new EditorEngine(fixture()),
    before = engine.getSnapshot();
  for (const basis of [Array(16).fill(0), [1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]])
    expect(() =>
      engine.execute({
        type: "updateLayers",
        ids: ["a"],
        patch: { spatial: { ...before.project.pages[0]!.layers[0]!.spatial!, basis } },
      }),
    ).toThrow();
  expect(() =>
    engine.execute({
      type: "updateLayers",
      ids: ["a"],
      patch: { spatial: createSpatialLayer("group") },
    }),
  ).toThrow();
  expect(engine.getSnapshot()).toBe(before);
});

test("grouping animated native children and dissolving a fixed parent preserve every sampled child pose", () => {
  const engine = new EditorEngine(fixture()),
    page = () => engine.getSnapshot().project.pages[0]!;
  engine.execute({
    type: "setCompositionMode",
    mode: "motion",
    plan: planMotionInitialization(engine.getSnapshot(), { value: 2, rate: 1 }),
  });
  for (const [time, value] of [
    [0, 0],
    [2, 90],
  ])
    engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: "a", property: "spatial.rotationY" },
      time: { value: time!, rate: 1 },
      value: value!,
    });
  const samples = () => {
    const program = compileMotion(engine.getSnapshot().project, { compositionId: page().id });
    return [0, 0.5, 1, 1.5].map((value) =>
      matrices(applyMotionFrame(program, evaluateMotion(program, { value: value * 2, rate: 2 }))),
    );
  };
  const original = samples();
  engine.execute({ type: "groupLayers", ids: ["a", "b"] });
  samples().forEach((pose, i) => close(pose, original[i]!));
  const id = engine.getSnapshot().selection[0]!,
    spatial = page().layers.find((l) => l.id === id)!.spatial!;
  engine.execute({
    type: "updateLayers",
    ids: [id],
    patch: { spatial: { ...spatial, rotationZ: 36, scaleX: 1.6, scaleY: 0.7 } },
  });
  const moved = samples();
  engine.execute({ type: "ungroupLayers", ids: [id] });
  samples().forEach((pose, i) => close(pose, moved[i]!));
});
test("reparenting native sources into a transformed group preserves world placement and undo", () => {
  const engine = new EditorEngine(fixture()),
    page = () => engine.getSnapshot().project.pages[0]!;
  engine.execute({ type: "groupLayers", ids: ["a"] });
  const id = engine.getSnapshot().selection[0]!,
    group = page().layers.find((l) => l.id === id)!;
  engine.execute({
    type: "updateLayers",
    ids: [id],
    patch: { spatial: { ...group.spatial!, rotationY: 57, scaleX: 1.9 } },
  });
  const expected = matrices(page());
  engine.execute({ type: "reorderLayer", id: "b", index: 0, parentId: id });
  close(matrices(page()), expected);
  engine.undo();
  close(matrices(page()), expected);
  expect(page().layers.find((l) => l.id === "b")!.parentId).toBeNull();
});
