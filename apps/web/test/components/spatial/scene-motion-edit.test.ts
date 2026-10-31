import { expect, it } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialScene,
  EditorEngine,
} from "@musart/core";
import { createMotionTransport } from "../../../src/services/motion/transport";
import { getMotionAuthoring } from "../../../src/state/session/motion-authoring";
import {
  addSceneMotionKey,
  captureSceneMotionEdit,
  isSceneMotionEditCurrent,
  removeSceneMotionKey,
  sceneMotionCommands,
  sceneMotionPreview,
} from "../../../src/components/spatial/scene-motion-edit";
const camera = { kind: "camera", compositionId: "page", property: "yaw" } as const;
function fixture() {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "page",
          spatial: createSpatialScene(),
          layers: [createLayer("rectangle")],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const page = () => engine.getSnapshot().project.pages[0]!;
  const transport = createMotionTransport(engine);
  return { engine, page, transport };
}
it("routes a scene scrub at a nonzero playhead into one undoable key transaction", () => {
  const d = fixture();
  addSceneMotionKey(d.engine, camera);
  d.transport.seek({ value: 1, rate: 1 });
  const before = d.page(),
    origin = captureSceneMotionEdit(d.engine, before);
  const scene = { ...before.spatial!, camera: { ...before.spatial!.camera, yaw: 80 } };
  const commands = sceneMotionCommands(d.engine, origin, scene, camera);
  expect(commands).toHaveLength(1);
  d.engine.transaction(commands);
  expect(d.page().spatial!.camera.yaw).toBe(before.spatial!.camera.yaw);
  expect(d.page().motion!.sceneProperties![0]!.keyframes.map(({ value }) => value)).toEqual([
    25, 80,
  ]);
  d.engine.undo();
  expect(d.page()).toEqual(before);
  d.transport.dispose();
});
it("Auto-key supports durable lights, while unarmed edits remain canonical", () => {
  const d = fixture();
  d.transport.seek({ value: 1, rate: 1 });
  const before = d.page(),
    target = {
      kind: "light",
      compositionId: "page",
      lightId: before.spatial!.lights[0]!.id,
      property: "intensity",
    } as const;
  getMotionAuthoring(d.engine).set(true);
  const origin = captureSceneMotionEdit(d.engine, before);
  const scene = {
    ...before.spatial!,
    lights: before.spatial!.lights.map((light) => ({ ...light, intensity: 7 })),
  };
  d.engine.transaction(sceneMotionCommands(d.engine, origin, scene, target));
  expect(d.page().spatial!.lights[0]!.intensity).toBe(3);
  expect(d.page().motion!.sceneProperties![0]!.keyframes[0]!.value).toBe(7);
  getMotionAuthoring(d.engine).set(false);
  const next = d.page();
  d.engine.transaction(
    sceneMotionCommands(d.engine, captureSceneMotionEdit(d.engine, next), {
      ...next.spatial!,
      environment: { ...next.spatial!.environment, rotation: 40 },
    }),
  );
  expect(d.page().spatial!.environment.rotation).toBe(40);
  d.transport.dispose();
});
it("preserves unrelated sampled properties in preview and rejects drafts after seeking", () => {
  const d = fixture();
  d.engine.transaction([
    { type: "upsertMotionKeyframe", target: camera, time: { value: 0, rate: 1 }, value: 0 },
    { type: "upsertMotionKeyframe", target: camera, time: { value: 2, rate: 1 }, value: 90 },
  ]);
  d.transport.seek({ value: 1, rate: 1 });
  const before = d.page(),
    origin = captureSceneMotionEdit(d.engine, before);
  const scene = {
    ...before.spatial!,
    environment: { ...before.spatial!.environment, intensity: 2 },
  };
  expect(sceneMotionPreview(origin, scene).camera.yaw).toBe(45);
  expect(d.page()).toBe(before);
  d.transport.seek({ value: 2, rate: 1 });
  expect(isSceneMotionEditCurrent(d.engine, origin)).toBe(false);
  expect(sceneMotionCommands(d.engine, origin, scene)).toEqual([]);
  d.transport.dispose();
});
it("explicit diamonds add and remove only the current exact rational key", () => {
  const d = fixture();
  addSceneMotionKey(d.engine, camera);
  d.transport.seek({ value: 1, rate: 1 });
  addSceneMotionKey(d.engine, camera);
  removeSceneMotionKey(d.engine, camera);
  expect(d.page().motion!.sceneProperties![0]!.keyframes).toHaveLength(1);
  expect(d.page().motion!.sceneProperties![0]!.keyframes[0]!.time.value).toBe(0);
  d.transport.dispose();
});
