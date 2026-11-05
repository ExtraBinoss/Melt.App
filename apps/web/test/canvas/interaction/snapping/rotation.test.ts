import { expect, it } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  getWorldMatrix,
  transformPoint,
} from "@musart/core";
import { rotationGuide } from "../../../../src/canvas/interaction/snapping/rotation";
import { SnapFeedback } from "../../../../src/canvas/interaction/snapping/source";
import { captureGestureOrigin } from "../../../../src/canvas/interaction/gesture-origin";
import {
  rotationHandlePoint,
  ROTATION_HANDLE_OFFSET,
} from "../../../../src/canvas/selection/rotation-handle";
it("follows the rotated local axis through nonuniform parents with constant screen offsets", () => {
  const parent = createLayer("group", {
      id: "parent",
      x: 45,
      y: 80,
      width: 400,
      height: 300,
      rotation: 37,
      scaleX: 1.4,
      scaleY: 0.7,
    }),
    layer = createLayer("vector", { parentId: parent.id, x: 50, y: 60, width: 100, height: 80 }),
    page = createPage({ layers: [parent, layer] });
  for (const zoom of [0.2, 1, 4]) {
    const guide = rotationGuide(page, layer, -330, zoom),
      posed = { ...page, layers: [parent, { ...layer, rotation: -330 }] },
      matrix = getWorldMatrix(posed, layer.id),
      pivot = transformPoint(matrix, { x: 50, y: 40 }),
      grip = rotationHandlePoint(layer.width, matrix, zoom),
      top = transformPoint(matrix, { x: 50, y: 0 });
    expect(Math.hypot(grip.x - top.x, grip.y - top.y) * zoom).toBeCloseTo(ROTATION_HANDLE_OFFSET);
    expect((grip.x - top.x) * matrix[0] + (grip.y - top.y) * matrix[1]).toBeCloseTo(0);
    expect(guide.center).toEqual(pivot);
    expect(guide.angle).toBe(30);
    expect(Math.hypot(guide.to.x - grip.x, guide.to.y - grip.y) * zoom).toBeCloseTo(16);
    expect(Math.hypot(guide.label.x - grip.x, guide.label.y - grip.y) * zoom).toBeCloseTo(34);
    const cross =
      (guide.to.x - pivot.x) * (grip.y - pivot.y) - (guide.to.y - pivot.y) * (grip.x - pivot.x);
    expect(cross).toBeCloseTo(0);
  }
});
it("publishes a rotation-only guide without spatial snaps, and clears stale/cancelled gestures", () => {
  const layer = createLayer("rectangle"),
    page = createPage({ layers: [layer] }),
    engine = new EditorEngine(createProject({ pages: [page] })),
    feedback = new SnapFeedback(engine),
    origin = captureGestureOrigin(engine),
    guide = rotationGuide(page, layer, 45, 1);
  feedback.set(origin, [], guide);
  expect(feedback.read().rotation?.angle).toBe(45);
  expect(feedback.read().cues).toEqual([]);
  expect(engine.getSnapshot().revision).toBe(origin.revision);
  feedback.clear();
  expect(feedback.read().rotation).toBeUndefined();
  engine.execute({ type: "updateLayers", ids: [layer.id], patch: { rotation: 90 } });
  feedback.set(origin, [], guide);
  expect(feedback.read().origin).toBeNull();
});
