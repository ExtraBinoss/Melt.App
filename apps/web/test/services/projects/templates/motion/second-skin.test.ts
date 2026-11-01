import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  MOTION_TEMPLATE_ASSET_REVISIONS,
  MOTION_TEMPLATE_CARD_CLIPS,
} from "../../../../../src/services/projects/templates/motion/asset-revisions";
import {
  EditorEngine,
  compileMotion,
  evaluateMotion,
  applyMotionFrame,
  parseProject,
} from "@musart/core";
import { createSecondSkin } from "../../../../../src/services/projects/templates/motion/second-skin/build";
import { parseMotionTemplateManifest } from "../../../../../src/services/projects/templates/motion/loader";
import { templateMedia } from "../../../../support/motion-template-media";

const build = () => {
  const m = templateMedia();
  return createSecondSkin({ ...m, video: { ...m.video, duration: { value: 10, rate: 1 } } });
};
test("shares one original and authors two sparse native actions with distinct natural, thermal and contour stages", () => {
  const built = build(),
    page = built.project.pages[0]!;
  const engine = new EditorEngine(built.initial, { now: () => built.initial.createdAt });
  for (const batch of built.batches) engine.transaction([...batch]);
  expect(engine.getSnapshot().project).toEqual(built.project);
  expect(build().project).toEqual(built.project);
  expect(Object.keys(built.project.assets)).toHaveLength(1);
  expect(page.layers.filter((l) => l.kind === "video")).toHaveLength(1);
  expect(page.layers.filter((l) => l.kind === "text").map((l) => l.text)).toEqual([
    "SECOND",
    "SKIN",
  ]);
  const blocks = page.motion!.tracks.flatMap((t) => t.animations ?? []);
  expect(blocks).toHaveLength(2);
  expect(blocks.flatMap((b) => b.preset.channels.flatMap((c) => c.points))).toHaveLength(20);
  expect(page.motion!.tracks.flatMap((t) => t.properties)).toHaveLength(0);
  const program = compileMotion(built.project, { compositionId: page.id });
  const at = (value: number) =>
    applyMotionFrame(
      program,
      evaluateMotion(program, { value, rate: 1 }, { terminalPreview: value === 10 }),
    );
  const effects = (value: number) =>
    at(value)
      .layers.find((l) => l.id === "skin-dancer")!
      .effects.map((f) => [f.type, f.amount]);
  expect(effects(0)).toEqual([
    ["thermal", 0],
    ["edge-detect", 0],
  ]);
  expect(effects(3)).toEqual([
    ["thermal", 1],
    ["edge-detect", 0],
  ]);
  expect(effects(7)).toEqual([
    ["thermal", 0],
    ["edge-detect", 1],
  ]);
  expect(effects(10)).toEqual(effects(0));
  expect(at(10).layers).toEqual(at(0).layers);
  expect(() => createSecondSkin(templateMedia())).toThrow("ten-second");
});
test("ships replayable validated data, a verified owned media original and rejects another template's media path", async () => {
  const root = "apps/web/public/templates/motion/second-skin";
  const raw = JSON.parse(await readFile(`${root}/second-skin.json`, "utf8"));
  const manifest = parseMotionTemplateManifest(raw, "second-skin");
  expect(manifest.originals).toHaveLength(1);
  const original = manifest.originals[0]!;
  expect(original.file).toBe("second-skin/media/second-skin-dancer.mp4");
  const bytes = await readFile("apps/web/public/templates/motion/" + original.file);
  expect(bytes.byteLength).toBe(original.byteLength);
  expect(bytes.byteLength).toBeLessThan(8 * 1024 * 1024);
  expect("sha256:" + createHash("sha256").update(bytes).digest("hex")).toBe(
    original.contentRevision,
  );
  expect(parseProject(await readFile(`${root}/second-skin.musart`, "utf8"))).toEqual(
    manifest.project,
  );
  const preview = parseMotionTemplateManifest(
    JSON.parse(await readFile(`${root}/second-skin.preview.json`, "utf8")),
    "second-skin",
  );
  expect(preview.project.pages).toEqual(manifest.project.pages);
  const derivative = preview.originals[0]!;
  expect(derivative.originalId).not.toBe(original.originalId);
  expect(derivative.byteLength).toBeLessThan(original.byteLength / 10);
  const previewBytes = await readFile("apps/web/public/templates/motion/" + derivative.file);
  expect(previewBytes.byteLength).toBe(derivative.byteLength);
  expect("sha256:" + createHash("sha256").update(previewBytes).digest("hex")).toBe(
    derivative.contentRevision,
  );
  expect(preview.project.assets["skin-video"]).toMatchObject({ width: 270, height: 480 });
  const card = JSON.parse(await readFile(`${root}/second-skin.card.json`, "utf8"));
  expect(card.sourceRevision).toBe(MOTION_TEMPLATE_ASSET_REVISIONS["second-skin"]);
  expect(card.sourceRevision).toBe(MOTION_TEMPLATE_CARD_CLIPS["second-skin"]!.sourceRevision);
  expect(card.manifestSha256).toBe(
    createHash("sha256")
      .update(await readFile(`${root}/second-skin.json`))
      .digest("hex"),
  );
  const clip = await readFile(`${root}/second-skin.card.mp4`);
  expect(clip.byteLength).toBe(card.bytes);
  expect(createHash("sha256").update(clip).digest("hex")).toBe(card.sha256);
  expect(card.sha256.startsWith(MOTION_TEMPLATE_CARD_CLIPS["second-skin"]!.revision)).toBe(true);
  const journal = JSON.parse(await readFile(`${root}/second-skin.commands.json`, "utf8"));
  const engine = new EditorEngine(journal.initial, { now: () => journal.initial.createdAt });
  for (const batch of journal.batches) engine.transaction(batch);
  expect(engine.getSnapshot().project).toEqual(manifest.project);
  for (const file of [
    "bloom-windows/media/second-skin-dancer.mp4",
    "second-skin/media/../private.mp4",
    "/second-skin/media/video.mp4",
    "https://example.com/video.mp4",
  ])
    expect(() =>
      parseMotionTemplateManifest({ ...raw, originals: [{ ...original, file }] }, "second-skin"),
    ).toThrow();
});
