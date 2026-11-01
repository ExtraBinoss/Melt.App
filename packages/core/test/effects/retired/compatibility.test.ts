import { expect, it } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  getEffectDefinition,
  parseProject,
  serializeProject,
} from "../../../src/index";
it("keeps retired scan documents and their Motion keys valid through save and undo", () => {
  const effect = createEffect("time-warp-scan", {
    id: "legacy",
    settings: { progress: 0.7, driftX: 0.5, samples: 60 },
  });
  expect(getEffectDefinition(effect.type).retired).toBe(true);
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          layers: [
            createLayer("rectangle", { id: "item", effects: [effect, createEffect("thermal")] }),
          ],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({
    type: "upsertMotionKeyframe",
    target: { kind: "effectSetting", layerId: "item", effectId: "legacy", property: "progress" },
    time: { value: 1, rate: 1 },
    value: 0.8,
  });
  const before = engine.getSnapshot().project;
  expect(parseProject(serializeProject(before))).toEqual(before);
  engine.execute({ type: "updateLayers", ids: ["item"], patch: { fill: "#ff0000" } });
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
});
