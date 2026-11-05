import { expect, test } from "vitest";
import {
  createLayer,
  createPage,
  createSpatialLayer,
  getWorldMatrix,
  transformPoint,
} from "@musart/core";
import { applyPreview, resizePatch } from "../../../src/canvas/interaction/gestures";
import { TransformSnapping } from "../../../src/canvas/interaction/snapping/transform";

test.each(["nw", "ne", "sw", "se"] as const)(
  "native %s scales ink while preserving wrapping, pose and its opposite visual anchor",
  (handle) => {
    const parent = createLayer("group", { id: "group", rotation: 23, scaleX: 1.3, scaleY: 0.8 }),
      layer = createLayer("text", {
        id: "text",
        parentId: parent.id,
        x: 30,
        y: 40,
        width: 500,
        height: 180,
        text: "Melt",
        fontSize: 70,
        rotation: -12,
        spatial: createSpatialLayer("extrude"),
      }),
      page = createPage({ layers: [parent, layer] }),
      bounds = { x: 20, y: 45, width: 150, height: 60 },
      matrix = getWorldMatrix(page, layer.id),
      from = transformPoint(matrix, { x: bounds.x, y: bounds.y }),
      to = transformPoint(matrix, { x: bounds.x + 30, y: bounds.y + 12 }),
      patch = resizePatch(page, layer, handle, from, to, true, bounds),
      next = applyPreview(page, [patch]);
    expect(next.layers[1]).toMatchObject({
      width: 500,
      height: 180,
      text: "Melt",
      fontSize: 70,
      spatial: layer.spatial,
    });
    expect(patch.patch.scaleX).not.toBe(1);
    expect(patch.patch.scaleX).toBeCloseTo(patch.patch.scaleY!);
    const anchor = {
      x: bounds.x + (handle.includes("w") ? bounds.width : 0),
      y: bounds.y + (handle.includes("n") ? bounds.height : 0),
    };
    const before = transformPoint(matrix, anchor),
      after = transformPoint(getWorldMatrix(next, layer.id), anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  },
);

test("native rotation uses the ink center and captured snapping uses its visible edge", () => {
  const layer = createLayer("text", {
      id: "text",
      x: 0,
      y: 0,
      width: 500,
      height: 180,
      spatial: createSpatialLayer("extrude"),
    }),
    page = createPage({
      width: 1000,
      height: 800,
      layers: [layer],
      guides: [{ id: "edge", axis: "x", position: 200 }],
    }),
    bounds = { x: 20, y: 45, width: 150, height: 60 },
    matrix = getWorldMatrix(page, layer.id),
    center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
    start = transformPoint(matrix, { x: center.x, y: center.y - 50 }),
    end = transformPoint(matrix, { x: center.x + 50, y: center.y }),
    rotation = resizePatch(page, layer, "rotate", start, end, false, bounds),
    next = applyPreview(page, [rotation]);
  expect(rotation.patch.rotation).toBeCloseTo(90);
  const before = transformPoint(matrix, center),
    after = transformPoint(getWorldMatrix(next, layer.id), center);
  expect(after.x).toBeCloseTo(before.x);
  expect(after.y).toBeCloseTo(before.y);
  const session = new TransformSnapping(page, [layer], bounds);
  const result = session.resize("e", { x: 170, y: 75 }, { x: 197, y: 75 }, false, true, 6);
  const resized = applyPreview(page, result.patches);
  expect(transformPoint(getWorldMatrix(resized, layer.id), { x: 170, y: 75 }).x).toBeCloseTo(200);
  expect(result.cues.some((cue) => cue.position === 200)).toBe(true);
});
