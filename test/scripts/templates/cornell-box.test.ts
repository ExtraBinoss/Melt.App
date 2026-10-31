import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import {
  applyMotionFrame,
  compileMotion,
  EditorEngine,
  evaluateMotion,
  serializeProject,
  validateProject,
  type SceneAsset,
} from "../../../packages/core/src/index";
import { createCornellBox } from "../../../apps/web/src/services/projects/templates/motion/cornell-box";
import { cornellRoomGlb } from "../../../scripts/templates/cornell/room";
import { parseMotionTemplateManifest } from "../../../apps/web/src/services/projects/templates/motion/loader";
function build() {
  const data = cornellRoomGlb();
  const room: SceneAsset = {
    id: "room-original",
    kind: "model3d",
    name: "Cornell Box",
    mime: "model/gltf-binary",
    width: 1080,
    height: 1080,
    byteLength: data.byteLength,
    dataUrl: `data:model/gltf-binary;base64,${Buffer.from(data).toString("base64")}`,
  };
  return createCornellBox(room);
}
test("replays the original room and editable chrome text through ordinary commands, with two Motion blocks and no keyframe tracks", () => {
  const result = build();
  validateProject(result.project);
  expect(serializeProject(build().project)).toBe(serializeProject(result.project));
  const replay = new EditorEngine(result.initial, { now: () => result.initial.createdAt });
  for (const batch of result.batches) replay.transaction([...batch]);
  expect(replay.getSnapshot().project).toEqual(result.project);
  const page = result.project.pages[0]!;
  expect(page.motion!.frameRate).toEqual({ numerator: 60, denominator: 1 });
  expect(page.layers.map((layer) => layer.spatial!.source)).toEqual(["glb", "extrude"]);
  expect(page.layers[1]).toMatchObject({ kind: "text", text: "Melt", fill: "#8B5CF6" });
  expect(
    page.motion!.tracks.every(
      (track) => track.properties.length === 0 && track.animations?.length === 1,
    ),
  ).toBe(true);
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
  const pose = (time: number) => at(time).layers.map((layer) => layer.spatial!.rotationY);
  expect(pose(0)).toEqual([-5, -5]);
  expect(pose(4)).toEqual([5, 5]);
  expect(pose(8)).toEqual(pose(0));
  expect(pose(0.01)[0]! - pose(0)[0]!).toBeLessThan(0.001);
  expect(pose(7.99)[0]! - pose(8)[0]!).toBeLessThan(0.001);
  const engine = new EditorEngine(project);
  const animation = project.pages[0]!.motion!.tracks[0]!.animations![0]!;
  engine.execute({
    type: "updateMotionAnimation",
    animationId: animation.id,
    patch: { strength: 0.5 },
  });
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(project);
  engine.redo();
  expect(engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.animations![0]!.strength).toBe(
    0.5,
  );
});
test("the checked-in gallery bundle installs a self-contained bounded GLB original", async () => {
  const bundle = JSON.parse(
    await readFile("apps/web/public/templates/motion/cornell-box.json", "utf8"),
  );
  expect(parseMotionTemplateManifest(bundle, "cornell-box").originals).toEqual([]);
  const bytes = cornellRoomGlb();
  expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(0x46546c67);
  const jsonLength = new DataView(bytes.buffer).getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  expect(gltf.meshes).toHaveLength(8);
  expect(gltf.buffers[0].uri).toBeUndefined();
  expect(bytes.byteLength).toBeLessThan(200_000);
});
