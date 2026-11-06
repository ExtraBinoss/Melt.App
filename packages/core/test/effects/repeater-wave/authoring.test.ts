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
  validateProject,
} from "../../../src/index";

for (const type of ["repeater", "wave-distortion"] as const) {
  test(`${type} exposes real SDK fields and validates editable portable settings`, () => {
    const effect = createEffect(type, { id: "fx" }),
      definition = getEffectDefinition(type),
      project = createProject({
        pages: [
          createPage({
            layers: [
              createLayer("rectangle", {
                id: "source",
                effects: [effect],
              }),
            ],
          }),
        ],
      });
    expect(definition.sdk?.direction).toBe("angle");
    for (const parameter of definition.parameters)
      expect(getEffectParameter(effect, parameter)).toBeDefined();
    validateProject(project);
    const invalid = structuredClone(project);
    invalid.pages[0]!.layers[0]!.effects[0]!.settings = { madeUp: 1 };
    expect(() => validateProject(invalid)).toThrow();
    const engine = new EditorEngine(project),
      before = engine.getSnapshot().project,
      field = definition.parameters.find(
        (p) => p.key === (type === "repeater" ? "spacingX" : "phase"),
      )!;
    engine.execute({
      type: "updateLayers",
      ids: ["source"],
      patch: {
        effects: [{ ...effect, ...patchEffectParameter(effect, field, 137) }],
      },
    });
    expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.settings![field.key]).toBe(
      137,
    );
    engine.undo();
    expect(engine.getSnapshot().project).toEqual(before);
    engine.redo();
    expect(engine.getSnapshot().project.pages[0]!.layers).toHaveLength(1);
    expect(() => patchEffectParameter(effect, field, Infinity)).toThrow();
  });
}

test("repeater limits copy work and keeps discrete layout edits validated", () => {
  const effect = createEffect("repeater"),
    fields = getEffectDefinition("repeater").parameters,
    count = fields.find((p) => p.key === "count")!,
    layout = fields.find((p) => p.key === "layout")!;
  for (const value of [0, 17, 2.5])
    expect(() => patchEffectParameter(effect, count, value)).toThrow();
  for (const value of ["linear", "grid", "radial"])
    expect(patchEffectParameter(effect, layout, value).settings).toEqual({ layout: value });
});

test("wave distortion owns four waveforms, four edge policies and no implicit time", () => {
  const effect = createEffect("wave-distortion"),
    fields = getEffectDefinition(effect.type).parameters;
  for (const key of ["waveform", "edge"]) {
    const field = fields.find((p) => p.key === key)!;
    expect(field.kind).toBe("select");
    if (field.kind !== "select") throw Error("Expected choices");
    expect(field.options).toHaveLength(4);
    for (const option of field.options)
      expect(patchEffectParameter(effect, field, option.value).settings![key]).toBe(option.value);
  }
  expect(fields.some((p) => p.key === "time" || p.key === "speed")).toBe(false);
  expect(getEffectDefinition(effect.type).sdk?.preferredTargets).toContain("phase");
});
