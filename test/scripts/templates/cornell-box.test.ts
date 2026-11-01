import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import {
  applyMotionFrame,
  compileMotion,
  EditorEngine,
  evaluateMotion,
  serializeProject,
  SCENE_MOTION_ANIMATION_PRESETS,
  validateProject,
} from "../../../packages/core/src/index";
import { createCornellBox } from "../../../apps/web/src/services/projects/templates/motion/cornell-box";
import { cornellRoomGlb } from "../../../scripts/templates/cornell/room";
import { parseMotionTemplateManifest } from "../../../apps/web/src/services/projects/templates/motion/loader";
const build = createCornellBox;
test("replays separate native Cornell objects and editable chrome text with one composition camera Motion action", () => {
  const result = build();
  validateProject(result.project);
  expect(serializeProject(build().project)).toBe(serializeProject(result.project));
  const replay = new EditorEngine(result.initial, { now: () => result.initial.createdAt });
  for (const batch of result.batches) replay.transaction([...batch]);
  expect(replay.getSnapshot().project).toEqual(result.project);
  const page = result.project.pages[0]!;
  expect(page.motion!.frameRate).toEqual({ numerator: 60, denominator: 1 });
  expect(page.motion!.duration).toEqual({ value: 8000, rate: 1000 });
  expect(page.layers.filter((layer) => layer.spatial?.source === "glb")).toHaveLength(0);
  expect(page.layers.filter((layer) => layer.spatial?.source === "box")).toHaveLength(7);
  expect(page.layers.filter((layer) => layer.spatial?.source === "group")).toHaveLength(1);
  expect(page.layers.find((layer) => layer.id === "cornell-melt")).toMatchObject({
    kind: "text",
    text: "Melt",
    fill: "#8B5CF6",
  });
  expect(
    page.motion!.tracks.every(
      (track) => track.properties.length === 0 && (track.animations?.length ?? 0) === 0,
    ),
  ).toBe(true);
  expect(page.motion!.tracks.flatMap((track) => track.animations ?? [])).toHaveLength(0);
  expect(page.motion!.sceneProperties ?? []).toHaveLength(0);
  expect(page.motion!.sceneAnimations).toHaveLength(1);
  const action = page.motion!.sceneAnimations![0]!;
  expect(action.owner).toEqual({ kind: "camera", compositionId: page.id });
  expect(action.preset).toEqual(
    SCENE_MOTION_ANIMATION_PRESETS.find((preset) => preset.id === "scene-camera-orbit"),
  );
  expect(action.preset.channels).toMatchObject([
    {
      target: { kind: "camera", property: "yaw" },
      operation: "replace",
      points: [
        { at: 0, value: 5 },
        { at: 0.5, value: -5 },
        { at: 1, value: 5 },
      ],
    },
  ]);
  expect(action.preset.channels[0]!.points).toHaveLength(3);
  expect(page.layers.find((layer) => layer.spatial?.source === "group")!.spatial).toMatchObject({
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    pivot: [0, 0, 0],
  });
  expect(Object.keys(result.project.assets)).toHaveLength(0);
  expect(page.spatial!.shadows).toBe(true);
});
test("orbits the real camera with sparse A/B/A points while objects and lights stay stationary", () => {
  const { project } = build();
  const page = project.pages[0]!;
  const sample = (input = project) => {
    const program = compileMotion(input, { compositionId: page.id });
    return (time: number) =>
      applyMotionFrame(
        program,
        evaluateMotion(
          program,
          { value: Math.round(time * 60000), rate: 60000 },
          { terminalPreview: time === 8 },
        ),
      );
  };
  const at = sample();
  const yaw = (time: number) => at(time).spatial!.camera.yaw;
  expect(yaw(0)).toBe(5);
  expect(yaw(4)).toBe(-5);
  expect(yaw(8)).toBe(yaw(0));
  expect(Math.abs(yaw(0.01) - yaw(0))).toBeLessThan(0.001);
  expect(Math.abs(yaw(7.99) - yaw(8))).toBeLessThan(0.001);
  for (const time of [0, 1, 4, 7, 8]) {
    const frame = at(time);
    expect(frame.layers).toEqual(page.layers);
    expect(frame.spatial!.lights).toEqual(page.spatial!.lights);
    expect(frame.spatial!.environment).toEqual(page.spatial!.environment);
    expect(frame.spatial!.camera).toEqual({ ...page.spatial!.camera, yaw: yaw(time) });
  }
  const engine = new EditorEngine(project);
  const animation = page.motion!.sceneAnimations![0]!;
  engine.execute({
    type: "updateMotionAnimation",
    animationId: animation.id,
    patch: { strength: 0.5 },
  });
  expect(sample(engine.getSnapshot().project)(4).spatial!.camera.yaw).toBe(0);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(project);
  engine.redo();
  expect(engine.getSnapshot().project.pages[0]!.motion!.sceneAnimations![0]!.strength).toBe(0.5);
  expect(sample(engine.getSnapshot().project)(4).spatial!.camera.yaw).toBe(0);
});
test("the gallery contains editable native objects and legacy Cornell originals remain valid", async () => {
  const bundle = JSON.parse(
    await readFile("apps/web/public/templates/motion/cornell-box.json", "utf8"),
  );
  expect(parseMotionTemplateManifest(bundle, "cornell-box").originals).toEqual([]);
  expect(bundle.project.pages[0].layers).toHaveLength(10);
  expect(bundle.project).toEqual(build().project);
  const journal = JSON.parse(
    await readFile("apps/web/public/templates/motion/cornell-box.commands.json", "utf8"),
  );
  const replay = new EditorEngine(journal.initial, { now: () => journal.initial.createdAt });
  for (const batch of journal.batches) replay.transaction(batch);
  expect(replay.getSnapshot().project).toEqual(bundle.project);
  const bytes = cornellRoomGlb();
  expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(0x46546c67);
  const jsonLength = new DataView(bytes.buffer).getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  expect(gltf.meshes).toHaveLength(8);
  expect(gltf.buffers[0].uri).toBeUndefined();
  expect(bytes.byteLength).toBeLessThan(200_000);
});
