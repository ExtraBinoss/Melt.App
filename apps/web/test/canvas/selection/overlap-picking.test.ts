import { expect, test } from "vitest";
import { createLayer, createLayerGeometryIndex, createPage, transformPoint } from "@musart/core";
import { canvasHit, canvasHits, canvasSelectionHit } from "../../../src/canvas/selection/hit";
import { registerPreparedContent } from "../../../src/canvas/selection/picking/prepared-content";
import { isCanvasCycle } from "../../../src/canvas/interaction/pointer-pick";
import { primitiveContentHit } from "../../../src/canvas/selection/picking/vector-hit";

test("ordinary artwork picks pass through empty groups, ellipse corners, rounded corners and transparent fills", () => {
  const back = createLayer("rectangle", { id: "back", x: 0, y: 0, width: 200, height: 200 });
  for (const front of [
    createLayer("group", { id: "front", x: 0, y: 0, width: 100, height: 100 }),
    createLayer("ellipse", { id: "front", x: 0, y: 0, width: 100, height: 100 }),
    createLayer("rectangle", { id: "front", x: 0, y: 0, width: 100, height: 100, radius: 20 }),
    createLayer("rectangle", {
      id: "front",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fill: "transparent",
      strokeWidth: 0,
    }),
  ])
    expect(canvasHit(createPage({ layers: [back, front] }), { x: 1, y: 1 })?.layer.id).toBe("back");
});

test("prepared source alpha uses local coordinates through transformed clipping groups and keeps stable selected targets", () => {
  const page = createPage({
    layers: [
      createLayer("rectangle", { id: "back", x: 0, y: 0, width: 500, height: 500 }),
      createLayer("group", {
        id: "group",
        x: 70,
        y: 90,
        width: 200,
        height: 200,
        rotation: 25,
        affine: [1, 0.2, 0.3, 1],
      }),
      createLayer("image", { id: "image", parentId: "group", x: 0, y: 0, width: 100, height: 100 }),
    ],
  });
  const geometry = createLayerGeometryIndex(page);
  const release = registerPreparedContent(
    page,
    (layer, point) => layer.id !== "image" || point.x > 50,
  );
  const hole = transformPoint(geometry.worldMatrix("image"), { x: 20, y: 50 });
  const ink = transformPoint(geometry.worldMatrix("image"), { x: 80, y: 50 });
  expect(canvasHit(page, hole)?.layer.id).toBe("back");
  expect(canvasHits(page, ink).map(({ layer }) => layer.id)).toEqual(["image", "group", "back"]);
  expect(canvasSelectionHit(page, hole, ["image"])?.layer.id).toBe("back");
  expect(canvasSelectionHit(page, ink, ["back"])).toMatchObject({
    layer: { id: "back" },
    clickTargetId: "image",
  });
  expect(canvasSelectionHit(page, ink, ["group"])?.layer.id).toBe("group");
  release();
});

test("normal picking ignores inherited locks while the explicit overlap stack retains locked targets", () => {
  const page = createPage({
    layers: [
      createLayer("rectangle", { id: "back", x: 0, y: 0, width: 100, height: 100 }),
      createLayer("group", { id: "group", x: 0, y: 0, width: 100, height: 100, locked: true }),
      createLayer("rectangle", {
        id: "child",
        parentId: "group",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      }),
    ],
  });
  expect(canvasHit(page, { x: 50, y: 50 })?.layer.id).toBe("back");
  expect(canvasHits(page, { x: 50, y: 50 }).find(({ layer }) => layer.id === "child")?.locked).toBe(
    true,
  );
  expect(canvasHits(page, { x: 50, y: 50 }, false).map(({ layer }) => layer.id)).toEqual(["back"]);
});

test("stroke-only primitives admit their ink without making their interior a hit", () => {
  const layer = createLayer("rectangle", {
    width: 100,
    height: 100,
    fill: "none",
    stroke: "#fff",
    strokeWidth: 10,
  });
  expect(primitiveContentHit(layer, { x: 2, y: 50 })).toBe(true);
  expect(primitiveContentHit(layer, { x: 50, y: 50 })).toBe(false);
});

test("overlap enumeration stays stable after repeated broad-phase queries with more than eight overlaps", () => {
  const page = createPage({
    layers: Array.from({ length: 20 }, (_, at) =>
      createLayer("rectangle", { id: `layer-${at}`, x: 0, y: 0, width: 100, height: 100 }),
    ),
  });
  const index = createLayerGeometryIndex(page);
  const point = { x: 50, y: 50 };
  const expected = page.layers.map(({ id }) => id).reverse();
  for (let at = 0; at < 3; at++) {
    index.hitTest(point);
    expect(canvasHits(page, point, false, index).map(({ layer }) => layer.id)).toEqual(expected);
  }
});

test("transparent hex paints pass through even when their RGB channels are nonzero", () => {
  for (const fill of ["#fff0", "#abcdef00", "transparent"]) {
    const layer = createLayer("rectangle", { width: 100, height: 100, fill, strokeWidth: 0 });
    expect(primitiveContentHit(layer, { x: 50, y: 50 })).toBe(false);
  }
});

test("overlap intent requires a primary Mod+Shift click and leaves Alt and additive modifiers alone", () => {
  const event = { button: 0, shiftKey: true, ctrlKey: true, metaKey: false, altKey: false };
  expect(isCanvasCycle(event)).toBe(true);
  expect(isCanvasCycle({ ...event, ctrlKey: false, metaKey: true })).toBe(true);
  expect(isCanvasCycle({ ...event, altKey: true })).toBe(false);
  expect(isCanvasCycle({ ...event, shiftKey: false })).toBe(false);
  expect(isCanvasCycle({ ...event, ctrlKey: false })).toBe(false);
  expect(isCanvasCycle({ ...event, button: 2 })).toBe(false);
});
