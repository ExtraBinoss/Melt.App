import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import {
  applyMotionFrame,
  compileMotion,
  EditorEngine,
  evaluateMotion,
  parseProject,
  serializeProject,
  validateProject,
  layerTransform,
  multiplyMatrices,
  transformPoint,
} from "@musart/core";
import { createBloomWindows } from "../../../../../src/services/projects/templates/motion/bloom-windows";
import { parseMotionTemplateManifest } from "../../../../../src/services/projects/templates/motion/loader";
import { templateMedia } from "../../../../support/motion-template-media";

const build = () => {
  const media = templateMedia();
  return createBloomWindows({
    ...media,
    video: { ...media.video, duration: { value: 12, rate: 1 } },
  });
};

test("rejects a short original instead of going blank before the loop ends", () => {
  expect(() => createBloomWindows(templateMedia())).toThrow("twelve-second video loop");
});

test("authors a deterministic 1080p loop through replayable commands with one shared original", () => {
  const result = build();
  validateProject(result.project);
  expect(serializeProject(build().project)).toBe(serializeProject(result.project));
  const replay = new EditorEngine(result.initial, { now: () => result.initial.createdAt });
  for (const batch of result.batches) replay.transaction([...batch]);
  expect(replay.getSnapshot().project).toEqual(result.project);
  expect(Object.values(result.project.assets)).toHaveLength(1);
  const page = result.project.pages[0]!;
  expect(page).toMatchObject({ width: 1920, height: 1080 });
  expect(page.motion).toMatchObject({
    duration: { value: 12000, rate: 1000 },
    frameRate: { numerator: 60, denominator: 1 },
  });
  expect(page.layers.filter((layer) => layer.kind === "video")).toHaveLength(4);
  expect(
    page.motion!.tracks.filter((track) => track.media).every((track) => track.media!.mute),
  ).toBe(true);
});

test("moves crop windows without moving the image underneath; closes every geometry/label path", () => {
  const { project } = build();
  const program = compileMotion(project, { compositionId: project.pages[0]!.id });
  const at = (time: number) =>
    applyMotionFrame(
      program,
      evaluateMotion(
        program,
        { value: Math.round(time * 60000), rate: 60000 },
        { terminalPreview: time === 12 },
      ),
    );
  const start = at(0);
  expect(at(12).layers).toEqual(start.layers);
  const middle = at(3.125);
  expect(middle.layers).not.toEqual(start.layers);
  for (const time of [0, 1 / 60, 1.313, 3.125, 6.77, 719 / 60, 12]) {
    const page = at(time);
    for (const id of ["dither", "ascii", "cyanotype"]) {
      const get = (suffix: string) =>
        page.layers.find((layer) => layer.id === `bw-${id}-${suffix}`)!;
      const window = get("window"),
        video = get("video");
      const world = multiplyMatrices(layerTransform(window), layerTransform(video));
      for (const point of [
        { x: 0, y: 0 },
        { x: 1920, y: 1080 },
      ]) {
        const aligned = transformPoint(world, point);
        expect(Math.abs(aligned.x - point.x)).toBeLessThan(1);
        expect(Math.abs(aligned.y - point.y)).toBeLessThan(1);
      }
      expect(window.mask).toBeNull();
      expect(window.effects[0]!.type).toBe(id);
      expect(window.width).toBeLessThanOrEqual(400);
      expect(get("label").x - window.x).toBeCloseTo(12, 8);
      expect(get("label").y - window.y).toBeCloseTo(-44, 8);
      expect(get("shadow").effects[0]).toMatchObject({
        type: "shadow",
        settings: { offsetY: 14, radius: 20 },
      });
    }
  }
  expect(at(1.2).layers).toEqual(start.layers);
  expect(start.layers.every((layer) => layer.opacity === 1)).toBe(true);
  expect(
    start.layers.some(
      (layer) => layer.name.includes("flash") || layer.name.includes("label backing"),
    ),
  ).toBe(false);
  const before = at(12 - 1 / 600).layers.find((layer) => layer.id === "bw-dither-window")!;
  const after = at(1 / 600).layers.find((layer) => layer.id === "bw-dither-window")!;
  const origin = start.layers.find((layer) => layer.id === before.id)!;
  expect(Math.abs(origin.y - before.y - (after.y - origin.y))).toBeLessThan(0.1);
  at(0);
  expect(at(3.125)).toEqual(middle);
});

test("ships a normal validated gallery bundle and command journal with one pinned local video", async () => {
  const root = "apps/web/public/templates/motion/bloom-windows";
  const manifest = parseMotionTemplateManifest(
    JSON.parse(await readFile(`${root}.json`, "utf8")),
    "bloom-windows",
  );
  expect(manifest.originals).toHaveLength(1);
  expect(manifest.originals[0]).toMatchObject({
    file: "media/bloom-windows-loop.mp4",
    mime: "video/mp4",
  });
  const original = await readFile(
    `apps/web/public/templates/motion/${manifest.originals[0]!.file}`,
  );
  const { createHash } = await import("node:crypto");
  expect(`sha256:${createHash("sha256").update(original).digest("hex")}`).toBe(
    manifest.originals[0]!.contentRevision,
  );
  expect(original.byteLength).toBe(manifest.originals[0]!.byteLength);
  expect(original.byteLength).toBeLessThan(8 * 1024 * 1024);
  expect(parseProject(await readFile(`${root}.musart`, "utf8"))).toEqual(manifest.project);
  const journal = JSON.parse(await readFile(`${root}.commands.json`, "utf8"));
  const engine = new EditorEngine(journal.initial, { now: () => journal.initial.createdAt });
  for (const batch of journal.batches) engine.transaction(batch);
  expect(engine.getSnapshot().project).toEqual(manifest.project);
});
