import { expect, test } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  getEffectDefinition,
  getEffectParameter,
  patchEffectParameter,
  validateEffectParameter,
  validateProject,
} from "../../../src/index";
import { MELT_DEFINITION } from "../../../src/effects/melt/definition";

test("melt declares bounded source-colored directional drips through the SDK", () => {
  const effect = createEffect("melt"),
    definition = getEffectDefinition("melt");
  expect(definition.nameKey).toBe("meltFx:name");
  expect(definition.coverage).toBe("expand");
  expect(definition.sdk?.direction).toBe("angle");
  expect(definition.sdk?.preferredTargets).toEqual(["phase", "distance", "liquidity"]);
  expect(MELT_DEFINITION.sdk?.preview?.source).toBe("editorial-portrait");
  expect(definition.parameters.some((p) => ["time", "speed", "palette"].includes(p.key))).toBe(
    false,
  );
  for (const parameter of definition.parameters) {
    expect(() =>
      validateEffectParameter(parameter, getEffectParameter(effect, parameter)),
    ).not.toThrow();
    if (parameter.kind !== "number") continue;
    expect(Number.isFinite(parameter.min) && Number.isFinite(parameter.max)).toBe(true);
    expect(() => validateEffectParameter(parameter, parameter.min - 1)).toThrow();
    expect(() => validateEffectParameter(parameter, parameter.max + 1)).toThrow();
  }
  expect(definition.parameters.find((p) => p.key === "tone")).toMatchObject({
    options: [{ value: "highlights" }, { value: "shadows" }],
  });
});

test("melt settings serialize, validate and commit atomically with undo/redo", () => {
  const effect = createEffect("melt", { id: "melt-effect" }),
    layer = createLayer("rectangle", { id: "source", effects: [effect] }),
    project = createProject({ pages: [createPage({ layers: [layer] })] }),
    engine = new EditorEngine(project),
    before = engine.getSnapshot().project,
    definition = getEffectDefinition("melt"),
    tone = definition.parameters.find((p) => p.key === "tone")!,
    phase = definition.parameters.find((p) => p.key === "phase")!,
    changed = {
      ...effect,
      ...patchEffectParameter(effect, tone, "shadows"),
    },
    animated = { ...changed, ...patchEffectParameter(changed, phase, 137) };
  engine.execute({ type: "updateLayers", ids: [layer.id], patch: { effects: [animated] } });
  const after = engine.getSnapshot().project;
  expect(after.pages[0]!.layers[0]!.effects[0]!.settings).toMatchObject({
    tone: "shadows",
    phase: 137,
  });
  expect(() => validateProject(JSON.parse(JSON.stringify(after)))).not.toThrow();
  expect(() => patchEffectParameter(effect, tone, "noise")).toThrow();
  expect(() => patchEffectParameter(effect, phase, Infinity)).toThrow();
  const invalid = structuredClone(after);
  invalid.pages[0]!.layers[0]!.effects[0]!.settings!.feedback = true;
  expect(() => validateProject(invalid)).toThrow();
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
  expect(engine.getSnapshot().canUndo).toBe(false);
  engine.redo();
  expect(engine.getSnapshot().project).toEqual(after);
});
