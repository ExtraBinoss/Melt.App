import { expect, test } from "vitest";
import {
  compileMotion,
  evaluateMotion,
  applyMotionFrame,
  type VideoAsset,
} from "../../../packages/core/src/index";
import { videoPlaybackWorkload } from "./workload";
const assets: VideoAsset[] = Array.from({ length: 8 }, (_, i) => ({
  id: `asset-${i}`,
  kind: "video",
  name: `CC0 source ${i}`,
  mime: "video/mp4",
  originalId: `original-${i}`,
  contentRevision: `sha256:${String(i).repeat(64)}`,
  byteLength: 1000,
  width: 1920,
  height: 1080,
  firstTimestamp: { value: 0, rate: 1 },
  duration: { value: 10, rate: 1 },
  timeResolution: 60000,
  orientation: { rotation: 0, flip: false, pixelAspectRatio: { numerator: 1, denominator: 1 } },
}));
for (const treatment of ["raw", "effects", "motion"] as const)
  test(`stages four to eight independent originals through real ${treatment} engine plans`, () => {
    const project = videoPlaybackWorkload(assets, treatment);
    const program = compileMotion(project, { compositionId: project.pages[0]!.id });
    const first = evaluateMotion(program, { value: 1, rate: 1 });
    const eight = evaluateMotion(program, { value: 5, rate: 1 });
    expect(first.mediaRequests).toHaveLength(4);
    expect(eight.mediaRequests).toHaveLength(8);
    const initial = applyMotionFrame(program, first),
      final = applyMotionFrame(program, eight);
    expect(initial.layers[0]!.width).toBe(final.layers[0]!.width);
    expect(final.layers[0]!.scaleX).toBeLessThan(initial.layers[0]!.scaleX!);
    expect(new Set(eight.mediaRequests.map((request) => request.assetId)).size).toBe(8);
    const animations = project.pages[0]!.motion!.tracks.flatMap((track) => track.animations ?? []);
    expect(animations.every((a) => a.preset.channels.every((c) => c.points.length === 2))).toBe(
      true,
    );
    expect(project.pages[0]!.layers.some((layer) => layer.effects.length > 0)).toBe(
      treatment !== "raw",
    );
  });
test("offers explicit over-budget densities without hiding duplicate streams or lowering originals", () => {
  const project = videoPlaybackWorkload(assets, "motion", undefined, 16);
  const program = compileMotion(project, { compositionId: project.pages[0]!.id });
  expect(evaluateMotion(program, { value: 5, rate: 1 }).mediaRequests).toHaveLength(16);
  expect(() => videoPlaybackWorkload(assets.slice(1))).toThrow("eight independent");
  expect(() =>
    videoPlaybackWorkload(assets.map((a) => ({ ...a, contentRevision: "same" }))),
  ).toThrow("copies");
});
