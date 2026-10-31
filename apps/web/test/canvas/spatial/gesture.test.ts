import { expect, test } from "vitest";
import { createStore } from "jotai/vanilla";
import { Group, MathUtils } from "three/webgpu";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  EditorEngine,
  planMotionInitialization,
} from "@musart/core";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { EMPTY_PREVIEW_SOURCE } from "../../../src/state/session/preview-source";
import { previewAtom } from "../../../src/state/session/editor";
import { SpatialGesture } from "../../../src/canvas/spatial/gesture";
import { createMotionTransport } from "../../../src/services/motion/transport";
import {
  addMotionPropertyKey,
  captureMotionEdit,
  motionLayerCommands,
  motionPreviewPatch,
  motionPropertyTrack,
} from "../../../src/state/session/motion-edit";
import { getMotionAuthoring } from "../../../src/state/session/motion-authoring";
function fixture() {
  const layer = createLayer("rectangle", { id: "box", spatial: createSpatialLayer("box") });
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ id: "page", layers: [layer] })] }),
  );
  engine.select([layer.id]);
  const store = createStore(),
    controller = new SceneController(engine, EMPTY_PREVIEW_SOURCE);
  const gesture = new SpatialGesture(engine, controller, store);
  const page = () => engine.getSnapshot().project.pages[0]!;
  return { engine, store, controller, gesture, page };
}
test("native transform drafts publish no document edits and release creates a single undoable command", () => {
  const f = fixture(),
    before = f.engine.getSnapshot().project,
    object = new Group();
  f.gesture.begin("box", "rotate");
  for (let i = 1; i <= 20; i++) {
    object.rotation.y = i / 20;
    f.gesture.object(object);
  }
  expect(f.engine.getSnapshot().project).toBe(before);
  expect(f.controller.read().page.layers[0]!.spatial!.rotationY).toBeCloseTo(180 / Math.PI);
  f.gesture.commit();
  expect(f.page().layers[0]!.spatial!.rotationY).toBeCloseTo(180 / Math.PI);
  f.engine.undo();
  expect(f.engine.getSnapshot().project).toEqual(before);
  f.engine.redo();
  expect(f.page().layers[0]!.spatial!.rotationY).toBeCloseTo(180 / Math.PI);
});
test("cancellation and stale edits restore the source and cannot overwrite another page or draft", () => {
  const f = fixture(),
    object = new Group();
  f.gesture.begin("box", "translate");
  object.position.x = 4;
  f.gesture.object(object);
  f.gesture.cancel();
  expect(f.controller.read().page.layers[0]!.spatial!.x).toBe(0);
  f.gesture.begin("box", "translate");
  f.gesture.object(object);
  f.engine.execute({ type: "updateLayers", ids: ["box"], patch: { fill: "#112233" } });
  f.gesture.commit();
  expect(f.page().layers[0]!.spatial!.x).toBe(0);
  f.gesture.beginOrbit();
  object.position.set(3, 2, 4);
  f.gesture.camera(object);
  expect(f.store.get(previewAtom)?.target).toBe("page");
  const replacement = { target: "page" as const, patch: { background: "#000000" } };
  f.store.set(previewAtom, replacement);
  f.gesture.cancel();
  expect(f.store.get(previewAtom)).toBe(replacement);
});
test("3D keyframe editing preserves animated neighbours and the authored base, including undo", () => {
  const f = fixture();
  f.engine.execute({
    type: "setCompositionMode",
    mode: "motion",
    plan: planMotionInitialization(f.engine.getSnapshot()),
  });
  const rotation = {
    kind: "layer" as const,
    layerId: "box",
    property: "spatial.rotationY" as const,
  };
  addMotionPropertyKey(f.engine, rotation);
  const transport = createMotionTransport(f.engine);
  transport.seek({ value: 1, rate: 1 });
  f.engine.transaction(
    motionLayerCommands(f.engine, captureMotionEdit(f.engine, rotation), ["box"], {
      spatial: { ...f.page().layers[0]!.spatial!, rotationY: 90 },
    }),
  );
  transport.seek({ value: 1, rate: 2 });
  expect(transport.readFrame()!.layers[0]!.spatial!.rotationY).toBe(45);
  const roughness = {
    kind: "layer" as const,
    layerId: "box",
    property: "spatial.material.roughness" as const,
  };
  getMotionAuthoring(f.engine).set(true);
  const before = f.engine.getSnapshot().project,
    origin = captureMotionEdit(f.engine, roughness),
    base = f.page().layers[0]!.spatial!;
  const patch = { spatial: { ...base, material: { ...base.material, roughness: 0.8 } } };
  expect(motionPreviewPatch(f.engine, origin, ["box"], patch).spatial!.rotationY).toBe(45);
  f.engine.transaction(motionLayerCommands(f.engine, origin, ["box"], patch));
  expect(f.page().layers[0]!.spatial).toEqual(base);
  expect(motionPropertyTrack(f.page(), roughness)?.keyframes).toMatchObject([{ value: 0.8 }]);
  expect(transport.readFrame()!.layers[0]!.spatial!.rotationY).toBe(45);
  f.engine.undo();
  expect(f.engine.getSnapshot().project).toEqual(before);
});
test("selection changes and foreign retained drafts cannot be overwritten by a late 3D release", () => {
  const f = fixture(),
    object = new Group();
  f.gesture.begin("box", "translate");
  object.position.x = 5;
  f.gesture.object(object);
  f.engine.select([]);
  f.gesture.invalidate();
  f.gesture.commit();
  expect(f.page().layers[0]!.spatial!.x).toBe(0);
  f.engine.select(["box"]);
  f.gesture.begin("box", "translate");
  f.gesture.object(object);
  f.controller.setGesture([{ layerId: "box", patch: { x: 123 } }]);
  f.gesture.cancel();
  expect(f.controller.read().page.layers[0]!.x).toBe(123);
  f.controller.setGesture([]);
});

test("native Euler wrapping preserves multiple turns and does not flip adjacent rotation channels", () => {
  for (const [from, delta, expected] of [
    [350, 20, 370],
    [100, 20, 120],
  ]) {
    const f = fixture(),
      base = f.page().layers[0]!.spatial!;
    f.engine.execute({
      type: "updateLayers",
      ids: ["box"],
      patch: { spatial: { ...base, rotationY: from } },
    });
    const object = new Group();
    object.rotation.y = MathUtils.degToRad(from!);
    f.gesture.begin("box", "rotate");
    object.rotateY(MathUtils.degToRad(delta!));
    f.gesture.object(object);
    f.gesture.commit();
    expect(f.page().layers[0]!.spatial!.rotationY).toBeCloseTo(expected!);
    expect(f.page().layers[0]!.spatial!.rotationX).toBeCloseTo(0);
    expect(f.page().layers[0]!.spatial!.rotationZ).toBeCloseTo(0);
  }
});
