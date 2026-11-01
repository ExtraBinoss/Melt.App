import { expect, test, vi } from "vitest";
import { createLayer, createPage, createProject } from "../../src/document/factories";
import type { Composition } from "../../src/document/model";
import { EditorEngine } from "../../src/session/engine";
import { createLayerGeometryIndex } from "../../src/layers/geometry-index";
import {
  getWorldBounds,
  invertMatrix,
  layerTransform,
  multiplyMatrices,
  transformPoint,
  IDENTITY,
  type Matrix,
  type Point,
} from "../../src/layers/geometry";

// Independent pre-index narrow-phase oracle, including parent clipping and group fallback.
function oracle(
  page: Composition,
  point: Point,
  parent: string | null = null,
  matrix: Matrix = IDENTITY,
): string | null {
  for (const layer of page.layers.filter((l) => l.parentId === parent).reverse()) {
    if (layer.maskSource || layer.locked || !layer.visible || layer.opacity <= 0) continue;
    const world = multiplyMatrices(matrix, layerTransform(layer));
    const local = transformPoint(invertMatrix(world), point);
    if (local.x < 0 || local.y < 0 || local.x > layer.width || local.y > layer.height) continue;
    if (
      layer.kind === "ellipse" &&
      ((local.x - layer.width / 2) / (layer.width / 2)) ** 2 +
        ((local.y - layer.height / 2) / (layer.height / 2)) ** 2 >
        1
    )
      continue;
    return (layer.kind === "group" ? oracle(page, point, layer.id, world) : null) ?? layer.id;
  }
  return null;
}

test("broad point rejection preserves transformed hierarchy, paint order, inherited flags and ellipse holes", () => {
  const layers = [
    createLayer("rectangle", { id: "background", width: 600, height: 500, x: 0, y: 0 }),
    createLayer("group", {
      id: "group",
      width: 110,
      height: 100,
      x: 90,
      y: 80,
      rotation: 23,
      affine: [1, 0.2, 0.4, 1],
    }),
    createLayer("ellipse", {
      id: "ellipse",
      parentId: "group",
      width: 65,
      height: 45,
      x: 80,
      y: 50,
      scaleX: -1,
    }),
    ...Array.from({ length: 180 }, (_, at) =>
      createLayer("rectangle", {
        id: `far-${at}`,
        x: 2000 + at * 10,
        y: 2000,
        width: 3,
        height: 3,
      }),
    ),
  ];
  for (const patch of [
    {},
    { locked: true },
    { visible: false },
    { maskSource: true },
    { opacity: 0 },
  ]) {
    const page = createPage({
      layers: layers.map((l) => (l.id === "group" ? { ...l, ...patch } : l)),
    });
    const geometry = createLayerGeometryIndex(page);
    for (let y = 50; y < 250; y += 11)
      for (let x = 50; x < 300; x += 13)
        expect(geometry.hitTest({ x, y })?.id ?? null).toBe(oracle(page, { x, y }));
  }
});

test("query bounds retain document order and descendants outside parent frames for marquee", () => {
  const page = createPage({
    layers: [
      createLayer("group", { id: "g", x: 0, y: 0, width: 10, height: 10 }),
      createLayer("rectangle", {
        id: "outside",
        parentId: "g",
        x: 100,
        y: 100,
        width: 5,
        height: 5,
      }),
      createLayer("rectangle", { id: "same", x: 100, y: 100, width: 5, height: 5 }),
    ],
  });
  const index = createLayerGeometryIndex(page);
  expect(index.queryBounds({ x: 100, y: 100, width: 5, height: 5 }).map((l) => l.id)).toEqual([
    "outside",
    "same",
  ]);
  expect(index.hitTest({ x: 102, y: 102 })?.id).toBe("same");
});

test("immutable revisions update descendants, reparenting, deletion, undo and redo without stale bounds", () => {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          layers: [
            createLayer("group", { id: "g", x: 0, y: 0, width: 50, height: 50 }),
            createLayer("rectangle", {
              id: "child",
              parentId: "g",
              x: 2,
              y: 2,
              width: 5,
              height: 5,
            }),
          ],
        }),
      ],
    }),
  );
  const page = () => engine.getSnapshot().project.pages[0]!;
  const original = createLayerGeometryIndex(page());
  expect(original.queryBounds({ x: 3, y: 3, width: 0, height: 0 }).map((l) => l.id)).toContain(
    "child",
  );
  engine.execute({
    type: "updateLayers",
    ids: ["g"],
    patch: { x: 100, rotation: 21, affine: [1, 0.1, 0.3, 1] },
  });
  const movedPage = page(),
    moved = createLayerGeometryIndex(movedPage);
  const bounds = getWorldBounds(movedPage, "child");
  expect(moved.queryBounds(bounds).map((l) => l.id)).toContain("child");
  expect(moved.queryBounds({ x: 3, y: 3, width: 0, height: 0 }).map((l) => l.id)).not.toContain(
    "child",
  );
  engine.execute({ type: "reorderLayer", id: "child", parentId: null, index: 0 });
  const reparented = createLayerGeometryIndex(page());
  expect(reparented.queryBounds(bounds).map((l) => l.id)).toContain("child");
  expect(reparented.get("child").parentId).toBeNull();
  engine.execute({ type: "deleteLayers", ids: ["child"] });
  expect(
    createLayerGeometryIndex(page())
      .queryBounds(bounds)
      .map((l) => l.id),
  ).not.toContain("child");
  engine.undo();
  expect(
    createLayerGeometryIndex(page())
      .queryBounds(bounds)
      .map((l) => l.id),
  ).toContain("child");
  engine.redo();
  expect(
    createLayerGeometryIndex(page())
      .queryBounds(bounds)
      .map((l) => l.id),
  ).not.toContain("child");
  expect(original.hitTest({ x: 3, y: 3 })?.id).toBe("child");
});

test("mutable Motion poses and cancelled drafts never reuse canonical spatial candidates", () => {
  const layer = createLayer("rectangle", { id: "moving", x: 0, y: 0, width: 10, height: 10 });
  const page = createPage({ layers: [layer] });
  const canonical = createLayerGeometryIndex(page);
  expect(canonical.hitTest({ x: 2, y: 2 })?.id).toBe("moving");
  const pose = { ...page, layers: [{ ...layer, x: 100 }] };
  expect(createLayerGeometryIndex(pose).hitTest({ x: 2, y: 2 })).toBeNull();
  expect(createLayerGeometryIndex(pose).hitTest({ x: 102, y: 2 })?.id).toBe("moving");
  expect(canonical.hitTest({ x: 2, y: 2 })?.id).toBe("moving");
});

test("one-off poses and repeated foreground overlap hits never prepare a full rectangle index", () => {
  const page = createPage({
    layers: Array.from({ length: 500 }, (_, at) =>
      createLayer("rectangle", { id: `overlap-${at}`, x: 0, y: 0, width: 100, height: 100 }),
    ),
  });
  const index = createLayerGeometryIndex(page),
    queries = vi.spyOn(index, "queryBounds");
  for (let at = 0; at < 20; at++) expect(index.hitTest({ x: 50, y: 50 })?.id).toBe("overlap-499");
  expect(queries).not.toHaveBeenCalled();
  expect(index.query).toBeUndefined();
  const pose = createLayerGeometryIndex({
    ...page,
    layers: page.layers.map((layer) => ({ ...layer, x: layer.x + 200 })),
  });
  expect(pose.hitTest({ x: 50, y: 50 })).toBeNull();
  expect(pose.query).toBeUndefined();
});

test("verified immutable cache hits bypass repeated container and layer integrity checks", () => {
  const engine = new EditorEngine(
    createProject({
      pages: [createPage({ layers: [createLayer("rectangle", { id: "cached" })] })],
    }),
  );
  const page = engine.getSnapshot().project.pages[0]!;
  const original = createLayerGeometryIndex(page);
  const integrity = vi.spyOn(Object, "isFrozen");
  const repeated = [createLayerGeometryIndex(page), createLayerGeometryIndex(page)];
  const checks = integrity.mock.calls.length;
  integrity.mockRestore();
  expect(repeated).toEqual([original, original]);
  expect(checks).toBe(0);
});

test("mutable and shallow-frozen drafts stay fresh until all cache admission checks pass", () => {
  const layer = createLayer("rectangle", { id: "draft", x: 1 });
  const page = createPage({ layers: [layer] });
  const mutable = createLayerGeometryIndex(page);
  layer.x = 25;
  const updated = createLayerGeometryIndex(page);
  expect(updated).not.toBe(mutable);
  expect(updated.worldBounds(layer.id).x).toBe(25);
  Object.freeze(page.layers);
  Object.freeze(page);
  const shallow = createLayerGeometryIndex(page);
  layer.x = 50;
  const changed = createLayerGeometryIndex(page);
  expect(changed).not.toBe(shallow);
  expect(changed.worldBounds(layer.id).x).toBe(50);
  Object.freeze(layer);
  const admitted = createLayerGeometryIndex(page);
  expect(createLayerGeometryIndex(page)).toBe(admitted);
});
