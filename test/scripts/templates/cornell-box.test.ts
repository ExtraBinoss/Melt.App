import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import {
  applyMotionFrame,
  compileMotion,
  EditorEngine,
  evaluateMotion,
  serializeProject,
  validateProject,
} from "../../../packages/core/src/index";
import { createCornellBox } from "../../../apps/web/src/services/projects/templates/motion/cornell-box";
import { cornellRoomGlb } from "../../../scripts/templates/cornell/room";
import { parseMotionTemplateManifest } from "../../../apps/web/src/services/projects/templates/motion/loader";
const build = createCornellBox;
test("replays separate native Cornell objects and editable chrome text with one parent Motion block", () => {
  const result = build();
  validateProject(result.project);
  expect(serializeProject(build().project)).toBe(serializeProject(result.project));
  const replay = new EditorEngine(result.initial, { now: () => result.initial.createdAt });
  for (const batch of result.batches) replay.transaction([...batch]);
  expect(replay.getSnapshot().project).toEqual(result.project);
  const page = result.project.pages[0]!;
  expect(page.motion!.frameRate).toEqual({ numerator: 60, denominator: 1 });
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
      (track) => track.properties.length === 0 && (track.animations?.length ?? 0) <= 1,
    ),
  ).toBe(true);
  expect(page.motion!.tracks.flatMap((track) => track.animations ?? [])).toHaveLength(1);
  expect(Object.keys(result.project.assets)).toHaveLength(0);
  expect(page.spatial!.shadows).toBe(true);
});
test("uses minimal A/B/A action points with identical end poses and zero-speed loop joins", () => {
  const { project } = build();
  const program = compileMotion(project, { compositionId: project.pages[0]!.id });
  const at = (time: number) =>
    applyMotionFrame(
      program,
      evaluateMotion(
        program,
        { value: Math.round(time * 60000), rate: 60000 },
        { terminalPreview: time === 8 },
      ),
    );
  const pose = (time: number) =>
    at(time)
      .layers.filter((layer) => layer.spatial?.source === "group")
      .map((layer) => layer.spatial!.rotationY);
  expect(pose(0)).toEqual([-5]);
  expect(pose(4)).toEqual([5]);
  expect(pose(8)).toEqual(pose(0));
  expect(pose(0.01)[0]! - pose(0)[0]!).toBeLessThan(0.001);
  expect(pose(7.99)[0]! - pose(8)[0]!).toBeLessThan(0.001);
  const engine = new EditorEngine(project);
  const animation = project.pages[0]!.motion!.tracks.find((track) => track.animations?.length)!
    .animations![0]!;
  engine.execute({
    type: "updateMotionAnimation",
    animationId: animation.id,
    patch: { strength: 0.5 },
  });
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(project);
  engine.redo();
  expect(
    engine.getSnapshot().project.pages[0]!.motion!.tracks.find((track) => track.animations?.length)!
      .animations![0]!.strength,
  ).toBe(0.5);
});
test("the gallery contains editable native objects and legacy Cornell originals remain valid", async () => {
  const bundle = JSON.parse(
    await readFile("apps/web/public/templates/motion/cornell-box.json", "utf8"),
  );
  expect(parseMotionTemplateManifest(bundle, "cornell-box").originals).toEqual([]);
  expect(bundle.project.pages[0].layers).toHaveLength(10);
  const bytes = cornellRoomGlb();
  expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(0x46546c67);
  const jsonLength = new DataView(bytes.buffer).getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  expect(gltf.meshes).toHaveLength(8);
  expect(gltf.buffers[0].uri).toBeUndefined();
  expect(bytes.byteLength).toBeLessThan(200_000);
});
