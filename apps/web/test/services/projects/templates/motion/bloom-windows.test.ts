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
  getWorldMatrix,
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

test("uses two linear keys per rotating part and keeps every source registered throughout the orbit", () => {
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
  const tracks = project.pages[0]!.motion!.tracks.flatMap((track) => track.properties);
  expect(tracks).toHaveLength(13);
  expect(
    tracks.every(
      (track) =>
        track.target.kind === "layer" &&
        track.target.property === "rotation" &&
        track.keyframes.length === 2,
    ),
  ).toBe(true);
  expect(tracks.reduce((count, track) => count + track.keyframes.length, 0)).toBe(26);
  const start = at(0);
  for (const time of Array.from({ length: 81 }, (_, index) => (index * 12) / 80)) {
    const page = at(time);
    for (const id of ["dither", "ascii", "cyanotype"]) {
      const get = (suffix: string) =>
        page.layers.find((layer) => layer.id === `bw-${id}-${suffix}`)!;
      const matrix = getWorldMatrix(page, get("video").id);
      for (const point of [
        { x: 0, y: 0 },
        { x: 1920, y: 1080 },
      ]) {
        const aligned = transformPoint(matrix, point);
        expect(Math.abs(aligned.x - point.x)).toBeLessThan(1e-6);
        expect(Math.abs(aligned.y - point.y)).toBeLessThan(1e-6);
      }
      const window = get("window");
      expect(window.effects[0]!.type).toBe(id);
      expect(window.width).toBeLessThanOrEqual(400);
      expect(get("label").parentId).toBe(get("label-anchor").id);
      expect(get("shadow").parentId).toBe(get("card").id);
      expect(get("shadow").fill).toBe("#14201c");
      const m = getWorldMatrix(page, window.id);
      expect(m[0]).toBeCloseTo(1, 8);
      expect(m[1]).toBeCloseTo(0, 8);
      if (time === 12 || time === 1.2) {
        const origin = getWorldMatrix(start, window.id);
        m.forEach((v, index) => expect(v).toBeCloseTo(origin[index]!, 8));
      }
    }
  }
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
