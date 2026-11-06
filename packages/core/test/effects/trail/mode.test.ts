import { expect, it } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  getEffectDefinition,
  patchEffectParameter,
  resolveEffectSettings,
  resolveTrailMode,
  trailMode,
  type Composition,
} from "../../../src/index";

function motion(page: Composition, layerId: string): Composition {
  const engine = new EditorEngine(createProject({ pages: [page] }));
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  for (const [value, time] of [
    [0, 0],
    [100, 1],
  ] as const)
    engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId, property: "x" },
      time: { value: time, rate: 1 },
      value,
    });
  return engine.getSnapshot().project.pages[0]!;
}

it("defaults stationary still images and text to visible current-source echoes without serializing derived settings", () => {
  const effect = createEffect("trail");
  expect(resolveEffectSettings(effect)).toMatchObject({ mode: "auto", expandBounds: true });
  for (const kind of ["image", "text"] as const) {
    const page = createPage({ layers: [createLayer(kind, { id: "owner", effects: [effect] })] });
    const original = JSON.stringify(page);
    expect(trailMode(effect, page, "owner")).toBe("offset");
    expect(resolveTrailMode(effect, page, "owner").settings).toMatchObject({
      mode: "offset",
      offsetX: 16,
    });
    expect(JSON.stringify(page)).toBe(original);
    const zeros = { ...effect, settings: { offsetX: 0, offsetY: 0 } };
    expect(resolveTrailMode(zeros, page, "owner").settings).toMatchObject({
      offsetX: 0,
      offsetY: 0,
    });
  }
});

it("chooses authored owner, ancestor, subtree and composition history, without treating an unrelated neighbour as motion", () => {
  const effect = createEffect("trail"),
    page = createPage({
      layers: [
        createLayer("group", { id: "parent" }),
        createLayer("text", { id: "owner", parentId: "parent", effects: [effect] }),
        createLayer("text", { id: "neighbour" }),
      ],
    });
  expect(trailMode(effect, motion(page, "owner"), "owner")).toBe("temporal");
  const animatedParent = motion(page, "parent");
  expect(trailMode(effect, animatedParent, "owner")).toBe("temporal");
  expect(trailMode(effect, motion(page, "owner"), "parent")).toBe("temporal");
  const neighbour = motion(page, "neighbour");
  expect(trailMode(effect, neighbour, "owner")).toBe("offset");
  expect(trailMode(effect, neighbour)).toBe("temporal");
  expect(
    trailMode(
      effect,
      { ...animatedParent, motion: { ...animatedParent.motion!, mode: "static" } },
      "owner",
    ),
  ).toBe("offset");
});

it("uses historical video frames and retains explicit temporal/offset choices", () => {
  const effect = createEffect("trail"),
    page = createPage({ layers: [createLayer("video", { id: "video" })] });
  expect(trailMode(effect, page, "video")).toBe("temporal");
  expect(trailMode(effect, page)).toBe("temporal");
  for (const mode of ["temporal", "offset"] as const) {
    const explicit = { ...effect, settings: { mode } };
    expect(resolveTrailMode(explicit, page, "video")).toBe(explicit);
    expect(resolveEffectSettings(resolveTrailMode(explicit, page)).offsetX).toBe(0);
  }
});

it("validates source overrides and makes extent changes one undoable document edit", () => {
  const effect = createEffect("trail"),
    definition = getEffectDefinition("trail"),
    parameter = (key: string) => definition.parameters.find((item) => item.key === key)!;
  expect(() => patchEffectParameter(effect, parameter("mode"), "invented")).toThrow();
  expect(() => patchEffectParameter(effect, parameter("expandBounds"), 0)).toThrow();
  const page = createPage({ layers: [createLayer("text", { id: "owner", effects: [effect] })] }),
    engine = new EditorEngine(createProject({ pages: [page] }));
  engine.execute({
    type: "updateLayers",
    ids: ["owner"],
    patch: {
      effects: [{ ...effect, ...patchEffectParameter(effect, parameter("expandBounds"), false) }],
    },
  });
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.settings?.expandBounds).toBe(
    false,
  );
  engine.undo();
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]).toEqual(effect);
  engine.redo();
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.settings?.expandBounds).toBe(
    false,
  );
});
