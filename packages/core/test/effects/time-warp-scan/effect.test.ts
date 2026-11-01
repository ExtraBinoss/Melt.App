import { expect, it } from "vitest";
import {
  EditorEngine,
  createProject,
  createPage,
  createLayer,
  createEffect,
  compileMotion,
  evaluateMotion,
  applyMotionFrame,
  resampleMotionFrame,
  motionFrameComposition,
  validateProject,
  getEffectDefinition,
} from "../../../src/index";

it("validates settings, exposes animation parameters and commits one reversible edit", () => {
  const effect = createEffect("time-warp-scan", { id: "scan" });
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "page",
          layers: [createLayer("rectangle", { id: "item", effects: [effect] })],
        }),
      ],
    }),
  );
  const before = engine.getSnapshot().project;
  expect(getEffectDefinition(effect.type).parameters.map((item) => item.key)).toContain("progress");
  engine.execute({
    type: "updateLayers",
    ids: ["item"],
    patch: { effects: [{ ...effect, settings: { ...effect.settings, driftX: 0.5 } }] },
  });
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
  engine.redo();
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.settings!.driftX).toBe(0.5);
  const invalid = structuredClone(before);
  invalid.pages[0]!.layers[0]!.effects[0]!.settings = { samples: 10000 };
  expect(() => validateProject(invalid)).toThrow();
});

it("resamples the original program at exact times without accumulating clocks or keys", () => {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "page",
          layers: [
            createLayer("rectangle", {
              id: "item",
              effects: [createEffect("time-warp-scan", { id: "scan", time: 0.25 })],
            }),
          ],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const before = engine.getSnapshot().project;
  const program = compileMotion(before, { compositionId: "page" });
  const frame = evaluateMotion(program, { value: 1, rate: 1 });
  expect(applyMotionFrame(program, frame).layers[0]!.effects[0]!.time).toBe(1.25);
  const seek = resampleMotionFrame(frame, { value: 1, rate: 2 });
  expect(seek.page.layers[0]!.effects[0]!.time).toBe(0.75);
  expect(motionFrameComposition(seek.plan)).toBe(program.composition);
  expect(resampleMotionFrame(seek.plan, { value: 1, rate: 1 }).page).toEqual(
    applyMotionFrame(program, frame),
  );
  expect(engine.getSnapshot().project).toBe(before);
  expect(() => resampleMotionFrame({ ...frame }, { value: 0, rate: 1 })).toThrow();
});
