import { expect, test } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  getEffectDefinition,
  parseProject,
  serializeProject,
  validateLiquifyDabs,
  isEffectParameterVisible,
  MAX_LIQUIFY_DABS,
  type LiquifyDab,
} from "../../src/index";
const dab: LiquifyDab = {
  x: 0.5,
  y: 0.5,
  dx: 0.08,
  dy: 0.03,
  radius: 0.25,
  strength: 0.5,
  hardness: 0.2,
  mode: "push",
};
test("brush documents roundtrip and one completed gesture undoes/redoes exact sparse controls", () => {
  const effect = createEffect("liquify"),
    layer = createLayer("rectangle", { effects: [effect] }),
    engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] }));
  const before = engine.getSnapshot().project;
  engine.execute({
    type: "updateLayers",
    ids: [layer.id],
    patch: { effects: [{ ...effect, liquify: [dab, { ...dab, x: 0.6 }] }] },
  });
  const after = engine.getSnapshot().project;
  expect(parseProject(serializeProject(after))).toEqual(after);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
  expect(engine.getSnapshot().canUndo).toBe(false);
  engine.redo();
  expect(engine.getSnapshot().project).toEqual(after);
  expect(() =>
    engine.execute({
      type: "updateLayers",
      ids: [layer.id],
      patch: { effects: [{ ...effect, liquify: [{ ...dab, radius: NaN }] }] },
    }),
  ).toThrow();
  expect(engine.getSnapshot().project).toEqual(after);
});
test("brush data is strictly bounded, belongs only to Liquify, and retains zero-strength samples", () => {
  expect(() =>
    validateLiquifyDabs(Array.from({ length: MAX_LIQUIFY_DABS + 1 }, () => dab)),
  ).toThrow();
  for (const patch of [
    { mode: "bad" },
    { dx: Infinity },
    { radius: -1 },
    { hardness: 1 },
    { unknown: true },
  ])
    expect(() => validateLiquifyDabs([{ ...dab, ...patch }])).toThrow();
  expect(() => validateLiquifyDabs([{ ...dab, strength: 0 }])).not.toThrow();
  expect(() =>
    serializeProject(
      createProject({
        pages: [
          createPage({
            layers: [
              createLayer("rectangle", { effects: [{ ...createEffect("blur"), liquify: [dab] }] }),
            ],
          }),
        ],
      }),
    ),
  ).toThrow();
});
test("classic halftone remains the imported default and new modes and torn paper reject invalid settings", () => {
  const old = createEffect("halftone");
  delete old.settings;
  expect(
    parseProject(
      serializeProject(
        createProject({
          pages: [createPage({ layers: [createLayer("rectangle", { effects: [old] })] })],
        }),
      ),
    ),
  ).toBeDefined();
  expect(getEffectDefinition("halftone").parameters.find((p) => p.key === "pattern")?.default).toBe(
    "legacy",
  );
  for (const effect of [
    createEffect("halftone", { settings: { pattern: "unknown" } }),
    createEffect("torn-edges", { settings: { roughness: -1 } }),
  ]) {
    expect(() =>
      serializeProject(
        createProject({
          pages: [createPage({ layers: [createLayer("rectangle", { effects: [effect] })] })],
        }),
      ),
    ).toThrow();
  }
});

test("techniques expose only the controls used by their treatment", () => {
  const visible = (effect: ReturnType<typeof createEffect>, key: string) =>
    isEffectParameterVisible(
      effect,
      getEffectDefinition(effect.type).parameters.find((p) => p.key === key)!,
    );
  expect(visible(createEffect("torn-edges"), "tearWidth")).toBe(false);
  expect(visible(createEffect("torn-edges", { settings: { technique: "paper" } }), "balance")).toBe(
    false,
  );
  expect(
    visible(createEffect("torn-edges", { settings: { technique: "paper" } }), "tearWidth"),
  ).toBe(true);
  expect(visible(createEffect("halftone"), "rotation")).toBe(false);
  expect(visible(createEffect("halftone", { settings: { pattern: "round-mosaic" } }), "ink")).toBe(
    false,
  );
  expect(
    visible(createEffect("halftone", { settings: { pattern: "color-screen" } }), "cyanAngle"),
  ).toBe(true);
});
