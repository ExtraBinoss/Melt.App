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
  resolveEffectSettings,
} from "@musart/core";

test("legacy scalar edits remain sparse while SDK settings validate and undo atomically", () => {
  const effect = createEffect("brightness");
  const definition = getEffectDefinition(effect.type);
  const x = definition.parameters.find((p) => p.key === "domainX")!;
  expect(effect.settings).toBeUndefined();
  expect(getEffectParameter(effect, x)).toBe(0.5);
  expect(resolveEffectSettings(effect).domainEnabled).toBe(false);
  expect(
    patchEffectParameter(
      effect,
      definition.parameters.find((p) => p.key === "amount")!,
      0.6,
    ),
  ).toEqual({ amount: 0.6 });
  const patch = patchEffectParameter(effect, x, 0.25);
  expect(patch.settings).toEqual({ domainX: 0.25 });
  const layer = createLayer("rectangle", { effects: [effect] });
  const engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] }));
  const before = engine.getSnapshot().project;
  engine.execute({
    type: "updateLayers",
    ids: [layer.id],
    patch: { effects: [{ ...effect, ...patch }] },
  });
  const after = engine.getSnapshot().project;
  expect(() =>
    engine.execute({
      type: "updateLayers",
      ids: [layer.id],
      patch: { effects: [{ ...effect, settings: { domainRadius: -1 } }] },
    }),
  ).toThrow();
  expect(engine.getSnapshot().project).toBe(after);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
  expect(engine.getSnapshot().canUndo).toBe(false);
  engine.redo();
  expect(engine.getSnapshot().project).toEqual(after);
});

test("Gradient preserves authored area without serializing new defaults during native edits", () => {
  const effect = createEffect("gradient", { settings: { domainX: 0.2, domainEnabled: true } });
  const parameters = getEffectDefinition("gradient").parameters;
  const native = parameters.find(
    (p) => p.scope === "settings" && p.kind === "number" && !p.key.startsWith("domain"),
  )!;
  const patch = patchEffectParameter(effect, native, getEffectParameter(effect, native));
  expect(patch.settings?.domainX).toBe(0.2);
  expect(patch.settings?.domainEnabled).toBe(true);
  expect(patch.settings?.domainRadius).toBeUndefined();
});
