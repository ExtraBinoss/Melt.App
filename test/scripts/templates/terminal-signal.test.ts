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
import { createTerminalSignal } from "../../../apps/web/src/services/projects/templates/motion/terminal-signal/build";
import { parseMotionTemplateManifest } from "../../../apps/web/src/services/projects/templates/motion/loader";
import { TEMPLATE_CATALOG } from "../../../apps/web/src/services/projects/templates/catalog";

test("the portrait terminal is editable, deterministic and replayable with sparse native actions", async () => {
  const built = createTerminalSignal(),
    page = built.project.pages[0]!;
  validateProject(built.project);
  expect(serializeProject(createTerminalSignal().project)).toBe(serializeProject(built.project));
  const replay = new EditorEngine(built.initial, { now: () => built.initial.createdAt });
  for (const batch of built.batches) replay.transaction([...batch]);
  expect(replay.getSnapshot().project).toEqual(built.project);
  expect(page).toMatchObject({
    width: 1080,
    height: 1920,
    motion: {
      duration: { value: 16000, rate: 1000 },
      frameRate: { numerator: 60, denominator: 1 },
    },
  });
  expect(page.layers.filter((layer) => layer.kind === "text")).toHaveLength(4);
  expect(Object.keys(built.project.assets)).toHaveLength(0);
  const actions = page.motion!.tracks.flatMap((track) => track.animations ?? []);
  expect(actions).toHaveLength(4);
  expect(
    actions.every(
      (action) =>
        action.preset.channels.length === 1 && action.preset.channels[0]!.points.length === 2,
    ),
  ).toBe(true);
  expect(
    page
      .motion!.tracks.flatMap((track) => track.properties)
      .every((track) => track.keyframes.length <= 4),
  ).toBe(true);
  const program = compileMotion(built.project, { compositionId: page.id });
  const at = (time: number) =>
    applyMotionFrame(program, evaluateMotion(program, { value: time * 1000, rate: 1000 }));
  const progress = (time: number) =>
    at(time)
      .layers.find((layer) => layer.id === "terminal-copy")!
      .effects.find((effect) => effect.type === "terminal")!.settings!.progress;
  expect(progress(0)).toBe(0);
  expect(progress(4.4)).toBeCloseTo(0.5);
  expect(progress(9)).toBe(1);
  expect(at(8).layers.find((layer) => layer.id === "terminal-transcript")!.y).toBeLessThan(
    at(2).layers.find((layer) => layer.id === "terminal-transcript")!.y,
  );
  expect(at(12).layers.find((layer) => layer.id === "terminal-transcript")!.opacity).toBe(0);
  expect(at(12).layers.find((layer) => layer.id === "terminal-finale")!.opacity).toBe(1);
  expect(built.project).toEqual(replay.getSnapshot().project);
  const bundle = JSON.parse(
    await readFile("apps/web/public/templates/motion/terminal-signal/terminal-signal.json", "utf8"),
  );
  expect(parseMotionTemplateManifest(bundle, "terminal-signal").project).toEqual(built.project);
  expect(TEMPLATE_CATALOG.find((item) => item.id === "terminal-signal")).toMatchObject({
    mode: "motion",
    category: "video",
    width: 1080,
    height: 1920,
  });
});
