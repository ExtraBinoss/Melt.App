import { expect, it } from "vitest";
import {
  createLayer,
  createPage,
  getWorldMatrix,
  invertMatrix,
  transformPoint,
} from "@musart/core";
import { vectorScreenMatrix, editableVector } from "../../../src/canvas/vector/geometry";
import { vectorContrast } from "../../../src/canvas/vector/contrast";
import { selectionSizeLabel } from "../../../src/canvas/selection/size-label";
it("maps viewBox coordinates through nested rotation, flips, nonuniform scaling and the viewport", () => {
  const group = createLayer("group", {
    id: "group",
    x: 100,
    y: 80,
    width: 400,
    height: 300,
    rotation: 31,
    scaleX: -1.2,
    scaleY: 0.8,
  });
  const layer = createLayer("vector", {
      parentId: group.id,
      x: 40,
      y: 20,
      width: 240,
      height: 80,
      rotation: 67,
      vector: { viewBox: "10 20 120 160", path: "M10 20L130 20L130 180Z" },
    }),
    page = createPage({ width: 800, height: 600, layers: [group, layer] }),
    view = { x: 43, y: -17, zoom: 0.35 };
  const matrix = vectorScreenMatrix(page, layer, view, { width: 1000, height: 700 });
  const world = transformPoint(getWorldMatrix(page, layer.id), { x: 120, y: 40 }),
    actual = transformPoint(matrix, { x: 70, y: 100 });
  expect(actual.x).toBeCloseTo(500 + 43 + (world.x - 400) * 0.35);
  expect(actual.y).toBeCloseTo(350 - 17 + (world.y - 300) * 0.35);
  const original = transformPoint(invertMatrix(matrix), actual);
  expect(original.x).toBeCloseTo(70);
  expect(original.y).toBeCloseTo(100);
  expect(editableVector(page, layer.id)?.id).toBe(layer.id);
  expect(
    editableVector({ ...page, layers: [{ ...group, locked: true }, layer] }, layer.id),
  ).toBeNull();
  expect(
    editableVector({ ...page, layers: [group, { ...layer, visible: false }] }, layer.id),
  ).toBeNull();
});
it("chooses contrast from the large painted path rather than tiny differently colored eyes", () => {
  const vector = {
    viewBox: "0 0 200 200",
    preserveColors: true,
    parts: [
      { path: "M0 0H200V200H0Z", fill: "#8b5cf6" },
      { path: "M50 50H54V54H50Z", fill: "#ffffff" },
    ],
  };
  expect(vectorContrast(vector, "#ffffff", "#000000")).toEqual({
    dominant: "#8b5cf6",
    ink: "#000000",
    halo: "#ffffff",
  });
  expect(vectorContrast({ ...vector, preserveColors: false }, "#080808", "#000000").ink).toBe(
    "#ffffff",
  );
  expect(vectorContrast({ ...vector, preserveColors: false }, "#ffffff", "#000000").ink).toBe(
    "#000000",
  );
});
it.each([0, 45, 90, 180, 270, -73])(
  "keeps dimensions upright and below nested flipped artwork at %s degrees",
  (rotation) => {
    const group = createLayer("group", {
      id: "g",
      x: 100,
      y: 80,
      width: 400,
      height: 300,
      rotation: 33,
      scaleX: -1.5,
      scaleY: 2,
    });
    const layer = createLayer("rectangle", {
      parentId: "g",
      width: 120,
      height: 60,
      rotation,
      scaleY: -1,
    });
    const page = createPage({ layers: [group, layer] }),
      matrix = getWorldMatrix(page, layer.id),
      zoom = 0.35;
    const label = selectionSizeLabel(layer, matrix, zoom);
    const inverse = label.transform
      .match(/^matrix\(([^)]+)\)/)![1]!
      .split(",")
      .map(Number);
    const a = matrix[0] * inverse[0]! + matrix[2] * inverse[1]!,
      b = matrix[1] * inverse[0]! + matrix[3] * inverse[1]!,
      c = matrix[0] * inverse[2]! + matrix[2] * inverse[3]!,
      d = matrix[1] * inverse[2]! + matrix[3] * inverse[3]!;
    expect(a * zoom).toBeCloseTo(1);
    expect(b).toBeCloseTo(0);
    expect(c).toBeCloseTo(0);
    expect(d * zoom).toBeCloseTo(1);
    const origin = transformPoint(matrix, { x: parseFloat(label.left), y: parseFloat(label.top) });
    const bottom = Math.max(
      ...[
        [0, 0],
        [120, 0],
        [120, 60],
        [0, 60],
      ].map(([x, y]) => transformPoint(matrix, { x: x!, y: y! }).y),
    );
    expect((origin.y - bottom) * zoom).toBeCloseTo(8);
  },
);

it("hides subpixel near-singular dimension frames instead of throwing", () => {
  expect(selectionSizeLabel({ width: 100, height: 50 }, [1e-9, 0, 0, 1e-9, 0, 0], 1).display).toBe(
    "none",
  );
});

it("declutters dense overview anchors while always retaining the selected source point", async () => {
  const { visibleVectorAnchors } =
    await import("../../../src/components/properties/vector/presentation");
  const points = [
    { x: 0, y: 0 },
    { x: 2, y: 1 },
    { x: 4, y: 0 },
    { x: 20, y: 0 },
    { x: 30, y: 0 },
  ];
  const shown = visibleVectorAnchors(points, 1);
  expect([...shown]).toEqual([1, 3, 4]);
  expect(points).toHaveLength(5);
});
