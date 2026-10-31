import { expect, test } from "vitest";
import {
  EditorEngine,
  parseProject,
  serializeProject,
  compileMotion,
  evaluateMotion,
  applyMotionFrame,
} from "@musart/core";
import { createMorphingType } from "../../../../../src/services/projects/templates/motion/morphing-type";
import { brand } from "../../../../../src/ui/brand/config";
test("authors the genuine Melt mascot with closed morph states, editable text and deterministic replay", () => {
  const built = createMorphingType(),
    replay = new EditorEngine(built.initial, { now: () => built.initial.createdAt });
  for (const batch of built.batches) replay.transaction([...batch]);
  expect(replay.getSnapshot().project).toEqual(built.project);
  const page = built.project.pages[0]!,
    body = page.layers.find((l) => l.id === "melt-mascot-body")!;
  expect(page.background).toBe("#ffffff");
  expect(body.kind).toBe("vector");
  expect(body.fill).toBe(brand.colors.primary);
  expect(page.layers.find((l) => l.kind === "text")?.text).toBe("MELT");
  expect(JSON.stringify(built.project)).not.toContain("MORPH");
  expect(body.effects).toEqual([]);
  expect(page.layers.some((layer) => layer.id === "melt-mouth")).toBe(false);
  const word = page.layers.find((layer) => layer.id === "melt-wordmark")!;
  expect(body.x + body.width).toBeLessThan(word.x);
  expect(word.effects[0]).toMatchObject({ type: "morph", settings: { inflate: 0.9, stretch: 3 } });
  const program = compileMotion(built.project, { compositionId: page.id });
  const sample = (value: number) =>
    applyMotionFrame(
      program,
      evaluateMotion(program, { value, rate: 1000 }, { terminalPreview: value === 6000 }),
    );
  for (const time of [0, 700, 1600, 2500, 6000])
    expect(sample(time).layers.find((l) => l.id === body.id)).toEqual(body);
  expect(sample(700).layers.find((l) => l.id === "melt-eye-0")!.x).not.toBe(
    sample(0).layers.find((l) => l.id === "melt-eye-0")!.x,
  );
  expect(sample(6000).layers.find((l) => l.id === "melt-eye-0")!.x).toBe(
    sample(0).layers.find((l) => l.id === "melt-eye-0")!.x,
  );
  expect(sample(0).layers.find((l) => l.id === word.id)!.effects[0]!.settings?.progress).toBe(0);
  expect(sample(2500).layers.find((l) => l.id === word.id)!.effects[0]!.settings?.progress).toBe(1);
  expect(sample(6000).layers.find((l) => l.id === word.id)!.effects[0]!.settings?.progress).toBe(0);
  expect(word.y).toBe(0);
  expect(word.height).toBe(1080);
  expect(word.effects[0]!.shapeMorph!.shapes.every((shape) => shape.frames.length === 67)).toBe(
    true,
  );
  expect(
    Math.max(
      ...word.effects[0]!.shapeMorph!.shapes.flatMap((shape) =>
        shape.frames.map((frame) => frame.box[3]),
      ),
    ),
  ).toBeGreaterThan(0.95);
  expect(page.motion!.tracks.flatMap((t) => t.animations ?? [])).toHaveLength(1);
  expect(parseProject(serializeProject(built.project))).toEqual(built.project);
});
