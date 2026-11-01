import { expect, test } from "vitest";
import {
  applyMotionFrame,
  compileMotion,
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  evaluateMotion,
  parseProject,
  serializeProject,
} from "../../../src/index";

test("terminal progress uses validated engine keys, deterministic seeking and one atomic undo", () => {
  const fx = createEffect("terminal", {
    id: "typing",
    settings: { columns: 20, rows: 4, cursor: "line" },
  });
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "page",
          layers: [createLayer("text", { id: "copy", text: "> EDIT ME", effects: [fx] })],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const before = engine.getSnapshot().project;
  const target = {
    kind: "effectSetting",
    layerId: "copy",
    effectId: "typing",
    property: "progress",
  } as const;
  engine.transaction([
    { type: "upsertMotionKeyframe", target, time: { value: 0, rate: 1 }, value: 0 },
    {
      type: "upsertMotionKeyframe",
      target,
      time: { value: 2, rate: 1 },
      value: 1,
      easing: { type: "linear" },
    },
  ]);
  const authored = engine.getSnapshot().project;
  const program = compileMotion(authored, { compositionId: "page" });
  for (const time of [1.5, 0, 1, 0.5, 1.5]) {
    const frame = evaluateMotion(program, { value: time * 1000, rate: 1000 });
    expect(applyMotionFrame(program, frame).layers[0]!.effects[0]!.settings!.progress).toBe(
      time / 2,
    );
  }
  expect(parseProject(serializeProject(authored))).toEqual(authored);
  expect(engine.getSnapshot().project).toBe(authored);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
  engine.redo();
  expect(engine.getSnapshot().project).toEqual(authored);
  const stable = engine.getSnapshot();
  expect(() =>
    engine.execute({
      type: "updateLayers",
      ids: ["copy"],
      patch: {
        effects: [{ ...fx, settings: { columns: 2.5 } }],
      },
    }),
  ).toThrow();
  expect(engine.getSnapshot()).toBe(stable);
  expect(() =>
    engine.execute({
      type: "upsertMotionKeyframe",
      target,
      time: { value: 0, rate: 1 },
      value: 1.1,
    }),
  ).toThrow();
  expect(engine.getSnapshot()).toBe(stable);
});
