import { expect, it } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  compileMotion,
  evaluateMotion,
} from "@musart/core";
import {
  effectDriverChannel,
  interactiveEffectChannels,
  effectMotionProperties,
  setEffectMotion,
  addEffectDriver,
  smoothAutomaticChannel,
} from "../../../../src/components/properties/effects/effect-motion/authoring";
import { effectAnimationChildren } from "../../../../src/components/layers/tree/effect-animations";
it.each([false, true])(
  "transfers both direct behaviors once, restores both on undo, and rejects invalid saves atomically (composition=%s)",
  (composition) => {
    const effect = createEffect("ripple"),
      layer = createLayer("rectangle", { effects: composition ? [] : [effect] });
    const engine = new EditorEngine(
      createProject({
        pages: [createPage({ layers: [layer], ...(composition ? { effects: [effect] } : {}) })],
      }),
    );
    const property = effectMotionProperties(engine, effect)[0]!;
    const automatic = {
      name: "Loop",
      channels: [
        smoothAutomaticChannel(
          effectDriverChannel(property, { kind: "loop", period: { value: 2, rate: 1 } }),
        ),
      ],
    };
    const interactive = {
      name: "Pointer",
      channels: [effectDriverChannel(property, { kind: "pointerX", initial: 0.5, events: [] })],
    };
    setEffectMotion(engine, effect.id, { automatic, interactive });
    const before = engine.getSnapshot();
    const take = structuredClone(interactive.channels);
    const driver = take[0]!.driver!;
    if ("events" in driver)
      take[0] = {
        ...take[0]!,
        driver: {
          ...driver,
          events: [
            ...driver.events,
            {
              kind: "pointer",
              x: 1,
              y: 0.5,
              dragging: false,
              at: { value: 1, rate: 1 },
            },
          ],
        },
      };
    addEffectDriver(engine, effect, take, "Take", 2000, true, automatic);
    const page = () => engine.getSnapshot().project.pages[0]!;
    const current = () => (composition ? page().effects! : page().layers[0]!.effects)[0]!;
    expect(current().motion).toBeUndefined();
    expect(
      effectAnimationChildren(page(), current(), composition ? undefined : page().layers[0]),
    ).toHaveLength(2);
    const program = compileMotion(engine.getSnapshot().project, { compositionId: page().id });
    expect(evaluateMotion(program, { value: 1, rate: 1 })).toBeDefined();
    engine.undo();
    expect(current().motion).toEqual({ automatic, interactive });
    expect(page().motion?.tracks.flatMap((track) => track.animations ?? []) ?? []).toHaveLength(0);
    engine.redo();
    expect(current().motion).toBeUndefined();
    engine.undo();
    const invalid = structuredClone(take);
    invalid[0]!.points = [];
    expect(() =>
      addEffectDriver(engine, effect, invalid, "Invalid", 2000, true, automatic),
    ).toThrow();
    expect(engine.getSnapshot().project).toEqual(before.project);
  },
);

it("starts direct drag at the effect's actual value in an asymmetric range", () => {
  const effect = createEffect("ripple"),
    layer = createLayer("rectangle", { effects: [effect] });
  const engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] }));
  const property = effectMotionProperties(engine, effect).find(
    (item) => item.target.property === "time",
  )!;
  const [channel] = interactiveEffectChannels(property, "pointerDrag", {
    response: "smooth",
    clickMode: "impulse",
    returnOnRelease: true,
    range: [0, 2],
  });
  expect(channel!.driver).toMatchObject({
    kind: "pointerDrag",
    initial: 0,
    events: [],
    returnOnRelease: true,
  });
});
