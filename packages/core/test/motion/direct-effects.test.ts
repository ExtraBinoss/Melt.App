import { expect, it } from "vitest";
import {
  applyMotionFrame,
  relativeEffectMotionAction,
  compileEffectMotionPreview,
  compileMotion,
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  evaluateMotion,
  validateProject,
} from "../../src/index";
import type { EffectMotionAction } from "../../src/index";
const automatic: EffectMotionAction = {
  name: "Loop",
  channels: [
    {
      target: { kind: "effect", slot: 0, property: "amount" },
      operation: "replace",
      driver: { kind: "loop", period: { value: 2, rate: 1 } },
      points: [
        { at: 0, value: 0 },
        { at: 0.5, value: 1, easing: { type: "cubicBezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 } },
        { at: 1, value: 0, easing: { type: "cubicBezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 } },
      ],
    },
  ],
};
function fixture(composition = false) {
  const effect = createEffect("ripple", { id: "fx", motion: { automatic } });
  const layer = createLayer("rectangle", { id: "shape", effects: composition ? [] : [effect] });
  const page = createPage({
    id: "page",
    layers: [layer],
    ...(composition ? { effects: [effect] } : {}),
  });
  const engine = new EditorEngine(createProject({ pages: [page] }));
  engine.execute({ type: "setCompositionMode", mode: "motion", confirmed: true });
  return { engine, effect };
}
it.each([false, true])(
  "evaluates portable direct motion on its actual owner (composition=%s) without document writes",
  (composition) => {
    const { engine } = fixture(composition),
      snapshot = engine.getSnapshot(),
      json = JSON.stringify(snapshot.project);
    const program = compileMotion(snapshot.project, { compositionId: "page" });
    const value = (time: number) => {
      const frame = applyMotionFrame(
        program,
        evaluateMotion(program, { value: Math.round(time * 100000), rate: 100000 }),
      );
      return (composition ? frame.effects! : frame.layers[0]!.effects)[0]!.amount;
    };
    expect(value(0)).toBe(0);
    expect(value(1)).toBe(1);
    expect(value(2)).toBe(0);
    expect(value(1.99999)).toBeCloseTo(value(0.00001), 8);
    expect(value(3)).toBe(1);
    expect(JSON.stringify(snapshot.project)).toBe(json);
    expect(engine.getSnapshot()).toBe(snapshot);
    validateProject(JSON.parse(json));
  },
);
it("rejects foreign slots, geometry units and recorded input in direct bindings", () => {
  const { engine } = fixture(),
    base = engine.getSnapshot().project;
  for (const mutate of [
    (action: EffectMotionAction) => {
      action.channels[0]!.target = { kind: "effect", slot: 1, property: "amount" };
    },
    (action: EffectMotionAction) => {
      action.channels[0]!.unit = "width";
    },
    (action: EffectMotionAction) => {
      action.channels[0]!.driver = {
        kind: "pointerX",
        initial: 0.5,
        events: [{ kind: "pointer", x: 1, y: 1, dragging: false, at: { value: 0, rate: 1 } }],
      };
    },
  ]) {
    const project = structuredClone(base),
      action = project.pages[0]!.layers[0]!.effects[0]!.motion!.automatic!;
    mutate(action);
    expect(() => validateProject(project)).toThrow();
  }
});
it("restores a direct binding through undo/redo and leaves interactive-only exports neutral", () => {
  const { engine } = fixture();
  const page = () => engine.getSnapshot().project.pages[0]!;
  const effect = page().layers[0]!.effects[0]!;
  engine.execute({
    type: "updateLayers",
    ids: ["shape"],
    patch: {
      effects: [
        {
          ...effect,
          motion: {
            interactive: {
              name: "Pointer",
              channels: [
                {
                  ...automatic.channels[0]!,
                  driver: { kind: "pointerX", initial: 0.5, events: [] },
                },
              ],
            },
          },
        },
      ],
    },
  });
  const program = compileMotion(engine.getSnapshot().project, { compositionId: "page" });
  expect(
    applyMotionFrame(program, evaluateMotion(program, { value: 1, rate: 1 })).layers[0]!.effects[0]!
      .amount,
  ).toBe(effect.amount);
  engine.undo();
  expect(page().layers[0]!.effects[0]!.motion?.automatic).toEqual(automatic);
  engine.redo();
  expect(page().layers[0]!.effects[0]!.motion?.interactive?.name).toBe("Pointer");
});

it("keeps automatic motion under neutral live input and composes recorded numeric offsets", () => {
  const { engine, effect } = fixture();
  const page = engine.getSnapshot().project.pages[0]!;
  const interactive: EffectMotionAction = {
    name: "Pointer",
    channels: [
      {
        target: { property: "amount", slot: 0, kind: "effect" },
        operation: "replace",
        points: [
          { at: 0, value: 0 },
          { at: 1, value: 1 },
        ],
        driver: { kind: "pointerX", initial: 0.5, events: [] },
      },
    ],
  };
  const relative = relativeEffectMotionAction(page, effect, interactive, automatic, "shape");
  expect(relative.channels[0]!.operation).toBe("add");
  expect(relative.channels[0]!.points.map((point) => point.value)).toEqual([-0.5, 0.5]);
  const sample = compileEffectMotionPreview(page, effect, [automatic, relative], "shape");
  expect(sample(0).amount).toBe(0);
  expect(sample(1).amount).toBe(1);
  expect(sample(2).amount).toBe(0);
  const driver = relative.channels[0]!.driver!;
  if ("events" in driver)
    relative.channels[0] = {
      ...relative.channels[0]!,
      driver: {
        ...driver,
        events: [
          ...driver.events,
          {
            kind: "pointer",
            at: { value: 1, rate: 1 },
            x: 0,
            y: 0.5,
            dragging: false,
          },
        ],
      },
    };
  const moved = compileEffectMotionPreview(page, effect, [automatic, relative], "shape");
  expect(moved(1).amount).toBeCloseTo(0.5);
  expect(moved(2).amount).toBe(0);
});
