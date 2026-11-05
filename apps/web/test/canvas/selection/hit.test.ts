import { expect, test } from "vitest";
import { createLayer, createLayerGeometryIndex, createPage } from "@musart/core";
import { canvasHit, canvasSelectionHit } from "../../../src/canvas/selection/hit";

test("pointer feedback can target a locked foreground while editing hit tests retain their exclusions", () => {
  const page = createPage({
    layers: [
      createLayer("rectangle", { id: "back", x: 0, y: 0, width: 200, height: 200 }),
      createLayer("group", {
        id: "locked-group",
        x: 20,
        y: 20,
        width: 100,
        height: 100,
        locked: true,
      }),
      createLayer("ellipse", {
        id: "child",
        parentId: "locked-group",
        x: 10,
        y: 10,
        width: 40,
        height: 40,
      }),
      createLayer("rectangle", {
        id: "hidden",
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        visible: false,
        locked: true,
      }),
    ],
  });
  expect(canvasHit(page, { x: 50, y: 50 })).toMatchObject({ layer: { id: "back" }, locked: false });
  expect(canvasHit(page, { x: 50, y: 50 }, true)).toMatchObject({
    layer: { id: "child" },
    locked: true,
  });
  expect(canvasHit(page, { x: 21, y: 21 }, true)).toMatchObject({
    layer: { id: "locked-group" },
    locked: true,
  });
  expect(canvasHit(page, { x: 210, y: 210 }, true)).toBeNull();
});

test("a tree-selected shape retains the move target only inside its exact geometry", () => {
  const page = createPage({
    layers: [
      createLayer("ellipse", { id: "selected", x: 20, y: 20, width: 100, height: 100 }),
      createLayer("rectangle", { id: "front", x: 0, y: 0, width: 200, height: 200 }),
    ],
  });
  const index = createLayerGeometryIndex(page);
  expect(canvasHit(page, { x: 70, y: 70 }, true, index)?.layer.id).toBe("front");
  expect(canvasSelectionHit(page, { x: 70, y: 70 }, ["selected"], index)?.layer.id).toBe(
    "selected",
  );
  expect(canvasSelectionHit(page, { x: 21, y: 21 }, ["selected"], index)?.layer.id).toBe("front");
  expect(canvasSelectionHit(page, { x: 70, y: 70 }, [], index)?.layer.id).toBe("front");
  expect(canvasSelectionHit(page, { x: 250, y: 250 }, ["selected"], index)).toBeNull();
});

test.each(["rectangle", "image"] as const)(
  "a selected %s backdrop keeps its drag target but a click resolves to the foreground",
  (kind) => {
    const page = createPage({
      width: 300,
      height: 200,
      layers: [
        createLayer(kind, { id: "background", x: 0, y: 0, width: 300, height: 200 }),
        createLayer("text", { id: "title", x: 40, y: 30, width: 150, height: 80 }),
      ],
    });
    expect(canvasSelectionHit(page, { x: 100, y: 60 }, ["background"])).toMatchObject({
      layer: { id: "background" },
      clickTargetId: "title",
    });
    expect(canvasSelectionHit(page, { x: 250, y: 160 }, ["background"])).toMatchObject({
      layer: { id: "background" },
    });
    expect(
      canvasSelectionHit(page, { x: 250, y: 160 }, ["background"])?.clickTargetId,
    ).toBeUndefined();
  },
);

test("a selected group moves as the group and ordinary picks preserve isolated hierarchy order", () => {
  const page = createPage({
    layers: [
      createLayer("group", { id: "group", x: 0, y: 0, width: 100, height: 100 }),
      createLayer("rectangle", { id: "front", x: 0, y: 0, width: 100, height: 100 }),
      createLayer("rectangle", {
        id: "child",
        parentId: "group",
        x: 0,
        y: 0,
        width: 80,
        height: 80,
      }),
    ],
  });
  expect(canvasHit(page, { x: 40, y: 40 }, true)?.layer.id).toBe("front");
  expect(canvasSelectionHit(page, { x: 40, y: 40 }, ["group"])?.layer.id).toBe("group");
  expect(canvasSelectionHit(page, { x: 40, y: 40 }, ["child"])?.layer.id).toBe("child");
  expect(canvasSelectionHit(page, { x: 40, y: 40 }, ["child", "front"])?.layer.id).toBe("front");
});

test("selected hits keep clipping, inherited protection and mask-source exclusions", () => {
  for (const patch of [
    {},
    { visible: false },
    { opacity: 0 },
    { locked: true },
    { maskSource: true },
  ]) {
    const page = createPage({
      layers: [
        createLayer("group", { id: "group", x: 20, y: 20, width: 60, height: 60, ...patch }),
        createLayer("rectangle", {
          id: "child",
          parentId: "group",
          x: 40,
          y: 0,
          width: 80,
          height: 80,
        }),
        createLayer("rectangle", { id: "front", x: 0, y: 0, width: 200, height: 200 }),
      ],
    });
    expect(canvasSelectionHit(page, { x: 100, y: 40 }, ["child"])?.layer.id).toBe("front");
    expect(canvasSelectionHit(page, { x: 70, y: 40 }, ["child"])?.layer.id).toBe(
      Object.keys(patch).length ? "front" : "child",
    );
  }
});

test("selected shape gaps do not fall back to an unselected ancestor or mask source", () => {
  const page = createPage({
    layers: [
      createLayer("rectangle", { id: "selected-back", x: 0, y: 0, width: 200, height: 200 }),
      createLayer("group", { id: "group", x: 0, y: 0, width: 200, height: 200 }),
      createLayer("ellipse", {
        id: "selected-child",
        parentId: "group",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      }),
      createLayer("rectangle", {
        id: "mask",
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        maskSource: true,
      }),
      createLayer("rectangle", { id: "front", x: 0, y: 0, width: 200, height: 200 }),
    ],
  });
  expect(
    canvasSelectionHit(page, { x: 1, y: 1 }, ["selected-child", "selected-back", "mask"])?.layer.id,
  ).toBe("selected-back");
  expect(
    canvasSelectionHit(page, { x: 50, y: 50 }, ["selected-child", "selected-back"])?.layer.id,
  ).toBe("selected-child");
});
