import { expect, it } from "vitest";
import {
  captureEffectTreatment,
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
} from "@musart/core";
import { applyTreatment } from "../../../src/services/effect-presets/apply";

function fixture() {
  const page = createPage({
    id: "page",
    layers: [
      createLayer("rectangle", { id: "first" }),
      createLayer("rectangle", { id: "second" }),
      createLayer("rectangle", { id: "locked", locked: true }),
    ],
  });
  return new EditorEngine(createProject({ pages: [page] }));
}
const stack = () =>
  captureEffectTreatment(
    "stack",
    "Poster texture",
    [
      createEffect("grain", { id: "grain", amount: 0.31 }),
      createEffect("blur", { id: "blur", amount: 0.2 }),
    ],
    {},
    "stack",
  );
it("applies ordered independent effects to multiple owners in one undoable transaction", () => {
  const engine = fixture(),
    origin = engine.getSnapshot(),
    saved = stack();
  applyTreatment(
    engine,
    origin,
    { pageId: "page", layerIds: ["first", "second"] },
    saved,
    "append",
  );
  const page = engine.getSnapshot().project.pages[0]!;
  const first = page.layers[0]!.effects,
    second = page.layers[1]!.effects;
  expect(first.map((effect) => effect.type)).toEqual(["grain", "blur"]);
  expect(second.map((effect) => effect.amount)).toEqual(first.map((effect) => effect.amount));
  expect(first[0]?.id).not.toBe(second[0]?.id);
  expect(engine.getSnapshot().revision).toBe(origin.revision + 1);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(origin.project);
  expect(engine.getSnapshot().canUndo).toBe(false);
  engine.redo();
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects).toEqual(first);
});
it("atomically imports originals and restores a single literal preset without stale palette links", () => {
  const engine = fixture();
  engine.execute({
    type: "updateLayers",
    ids: ["first"],
    patch: { effects: [createEffect("displace", { id: "existing" })] },
  });
  const asset = {
    id: "map",
    name: "Map",
    mime: "image/png",
    width: 1,
    height: 1,
    dataUrl: "data:image/png;base64,AAAA",
  };
  const saved = captureEffectTreatment(
    "preset",
    "Emboss",
    [
      createEffect("displace", {
        id: "source",
        amount: 0.44,
        inputs: { map: "map" },
        settings: { domainX: 0.2 },
      }),
    ],
    { map: asset },
    "effect",
  );
  const origin = engine.getSnapshot();
  applyTreatment(
    engine,
    origin,
    { pageId: "page", layerIds: ["first"], effectId: "existing" },
    saved,
    "replace",
  );
  const current = engine.getSnapshot(),
    effect = current.project.pages[0]!.layers[0]!.effects[0]!;
  expect(effect).toMatchObject({
    id: "existing",
    amount: 0.44,
    preset: { id: "preset", name: "Emboss" },
    settings: { domainX: 0.2 },
  });
  expect(effect.colorLinks).toBeUndefined();
  expect(current.project.assets[effect.inputs!.map!]).toMatchObject({
    ...asset,
    id: effect.inputs!.map,
  });
  saved.effects[0]!.amount = 0.9;
  expect(effect.amount).toBe(0.44);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(origin.project);
  engine.redo();
  expect(engine.getSnapshot().project).toEqual(current.project);
});
it("replaces composition stacks and rejects stale, locked, incompatible or duplicate owners atomically", () => {
  const engine = fixture();
  applyTreatment(engine, engine.getSnapshot(), { pageId: "page" }, stack(), "replace");
  expect(engine.getSnapshot().project.pages[0]!.effects?.map((effect) => effect.type)).toEqual([
    "grain",
    "blur",
  ]);
  const origin = engine.getSnapshot();
  for (const ids of [["first", "locked"], ["missing"], ["first", "first"], []]) {
    expect(() =>
      applyTreatment(engine, origin, { pageId: "page", layerIds: ids }, stack(), "append"),
    ).toThrow();
    expect(engine.getSnapshot()).toBe(origin);
  }
  const depth = captureEffectTreatment(
    "depth",
    "Focus",
    [createEffect("depth-of-field")],
    {},
    "effect",
  );
  expect(() =>
    applyTreatment(engine, origin, { pageId: "page", layerIds: ["first"] }, depth, "append"),
  ).toThrow("depth");
  engine.select(["first"]);
  expect(() =>
    applyTreatment(engine, origin, { pageId: "page", layerIds: ["first"] }, stack(), "append"),
  ).toThrow("stale");
});
