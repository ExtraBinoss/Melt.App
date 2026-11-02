import { expect, it } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  EditorEngine,
  getWorldMatrix,
  SpatialGeometry,
} from "@musart/core";
import { validateLayerDrop } from "../../../../src/components/layers/drag/validation";

it("uses the canonical core rule for animated hierarchy and retained Static animations", () => {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          layers: [
            createLayer("group", { id: "group" }),
            createLayer("rectangle", { id: "a", parentId: "group" }),
            createLayer("rectangle", { id: "b", parentId: "group" }),
          ],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({
    type: "upsertMotionKeyframe",
    target: { kind: "layer", layerId: "a", property: "x" },
    time: { value: 1, rate: 1 },
    value: 25,
  });
  for (const mode of ["motion", "static"] as const) {
    if (mode === "static") engine.execute({ type: "setCompositionMode", mode });
    const page = engine.getSnapshot().project.pages[0]!;
    expect(validateLayerDrop(page, "a", "b", "before")).toHaveProperty("layers");
    expect(validateLayerDrop(page, "a", "group", "before")).toEqual({
      reason: "animatedHierarchy",
    });
  }
});

it("keeps ordinary reparenting and masks available, but rejects cycles, absent IDs and inherited locks", () => {
  const page = createPage({
    layers: [
      createLayer("group", { id: "group" }),
      createLayer("rectangle", { id: "child", parentId: "group" }),
      createLayer("rectangle", { id: "other" }),
    ],
  });
  expect(validateLayerDrop(page, "other", "group", "inside")).toHaveProperty("layers");
  expect(validateLayerDrop(page, "group", "child", "inside")).toEqual({ reason: "cycle" });
  expect(validateLayerDrop(page, "group", "child", "mask")).toEqual({ reason: "cycle" });
  expect(validateLayerDrop(page, "missing", "other", "before")).toEqual({ reason: "cycle" });
  expect(validateLayerDrop(page, "other", "child", "mask")).toHaveProperty("layers");
  page.layers[0]!.locked = true;
  expect(validateLayerDrop(page, "child", "other", "before")).toEqual({ reason: "locked" });
});

it.each([false, true])(
  "previews the exact committed world frames for reparenting (spatial=%s)",
  (spatial) => {
    const engine = new EditorEngine(
      createProject({
        pages: [
          createPage({
            layers: [
              createLayer("group", {
                id: "group",
                x: 110,
                y: 80,
                rotation: 23,
                scaleX: 1.4,
                ...(spatial ? { spatial: createSpatialLayer("group") } : {}),
              }),
              createLayer("text", {
                id: "text",
                x: 40,
                y: 60,
                rotation: -12,
                ...(spatial ? { spatial: createSpatialLayer("extrude") } : {}),
              }),
            ],
          }),
        ],
      }),
    );
    const before = engine.getSnapshot();
    const page = before.project.pages[0]!;
    const result = validateLayerDrop(page, "text", "group", "inside");
    expect(result).toHaveProperty("layers");
    if (!("layers" in result)) throw new Error("Expected a valid hierarchy preview");
    const preview = { ...page, layers: result.layers };
    expect(engine.getSnapshot()).toBe(before);
    expect(page.layers.find((layer) => layer.id === "text")!.parentId).toBeNull();
    engine.execute({ type: "reorderLayer", id: "text", index: 1, parentId: "group" });
    const committed = engine.getSnapshot().project.pages[0]!;
    expect(preview.layers.find((layer) => layer.id === "text")).toEqual(
      committed.layers.find((layer) => layer.id === "text"),
    );
    const matrix = spatial
      ? new SpatialGeometry(preview).worldMatrix("text")
      : getWorldMatrix(preview, "text");
    const original = spatial
      ? new SpatialGeometry(page).worldMatrix("text")
      : getWorldMatrix(page, "text");
    matrix.forEach((value, index) => expect(value).toBeCloseTo(original[index]!));
  },
);
