import { expect, it } from "vitest";
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
  copyContent,
  parseClipboard,
  pasteContent,
  extractMotionAnimationPreset,
  captureMotionAnimationPreset,
  type ImageAsset,
} from "../../../src/index";
const data =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9WQAAAAASUVORK5CYII=";
const asset: ImageAsset = {
  id: "map",
  name: "map.png",
  mime: "image/png",
  width: 1,
  height: 1,
  dataUrl: data,
};
it("owns bounded validated editable settings and allows numeric Motion keys for all three treatments", () => {
  for (const type of ["bevel", "thermal", "displace"] as const) {
    const effect = createEffect(type, { id: "fx" });
    const definition = getEffectDefinition(type);
    expect(definition.parameters.length).toBeGreaterThan(10);
    for (const parameter of definition.parameters)
      expect(getEffectParameter(effect, parameter)).toBeDefined();
    const engine = new EditorEngine(
      createProject({
        pages: [
          createPage({ layers: [createLayer("rectangle", { id: "layer", effects: [effect] })] }),
        ],
      }),
    );
    const before = engine.getSnapshot().project;
    const parameter = definition.parameters.find(
      (p) => p.scope === "settings" && p.kind === "number",
    )!;
    if (parameter.kind !== "number") throw Error("Missing numeric setting");
    engine.execute({
      type: "updateLayers",
      ids: ["layer"],
      patch: {
        effects: [{ ...effect, ...patchEffectParameter(effect, parameter, parameter.max) }],
      },
    });
    engine.undo();
    expect(engine.getSnapshot().project).toEqual(before);
    engine.redo();
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "effectSetting", layerId: "layer", effectId: "fx", property: parameter.key },
      time: { value: 0, rate: 1 },
      value: parameter.min,
    });
    expect(() =>
      engine.execute({
        type: "updateLayers",
        ids: ["layer"],
        patch: { effects: [{ ...effect, settings: { unknown: 123 } }] },
      }),
    ).toThrow();
  }
});
it("validates named image inputs against owned project assets and keeps portable copies/undo atomic", () => {
  const effect = createEffect("displace", { id: "fx", inputs: { map: "map" } });
  const project = createProject({
    assets: { map: asset },
    pages: [createPage({ layers: [createLayer("rectangle", { id: "layer", effects: [effect] })] })],
  });
  validateProject(project);
  const missing = structuredClone(project);
  delete missing.assets.map;
  expect(() => validateProject(missing)).toThrow();
  const unknown = structuredClone(project);
  unknown.pages[0]!.layers[0]!.effects[0]!.inputs = { unknown: "map" };
  expect(() => validateProject(unknown)).toThrow();
  const noInputs = structuredClone(project);
  noInputs.pages[0]!.layers[0]!.effects[0]!.type = "bevel";
  expect(() => validateProject(noInputs)).toThrow();
  const engine = new EditorEngine(project);
  engine.select(["layer"]);
  const target = new EditorEngine(createProject());
  const content = parseClipboard(
    copyContent(engine.getSnapshot(), { includeImages: true }),
    target.getSnapshot().project,
  );
  let id = 0;
  const pasted = pasteContent(
    content,
    target.getSnapshot().project,
    { x: 100, y: 100 },
    () => `pasted-${++id}`,
  );
  target.transaction(pasted.commands);
  const page = target.getSnapshot().project.pages[0]!;
  const inputId = page.layers[0]!.effects[0]!.inputs!.map!;
  expect(target.getSnapshot().project.assets[inputId]).toMatchObject({ dataUrl: data });
  expect(inputId).not.toBe("map");
  target.undo();
  expect(Object.keys(target.getSnapshot().project.assets)).toHaveLength(0);
});

it("keeps reusable Motion recipes independent of project-only displacement asset IDs", () => {
  const engine = new EditorEngine(
    createProject({
      assets: { map: asset },
      pages: [
        createPage({
          layers: [
            createLayer("rectangle", {
              id: "layer",
              effects: [createEffect("displace", { id: "fx", inputs: { map: "map" } })],
            }),
          ],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  for (const value of [0, 1])
    engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "effect", layerId: "layer", effectId: "fx", property: "amount" },
      time: { value, rate: 1 },
      value,
    });
  let page = engine.getSnapshot().project.pages[0]!;
  const preset = extractMotionAnimationPreset(
    page,
    page.motion!.tracks[0]!,
    "Displace",
    "displace-user",
  );
  expect(preset.effects[0]).not.toHaveProperty("inputs");
  engine.execute({
    type: "addMotionAnimation",
    trackId: page.motion!.tracks[0]!.id,
    preset,
    start: { value: 0, rate: 1 },
  });
  page = engine.getSnapshot().project.pages[0]!;
  const animation = page.motion!.tracks[0]!.animations![0]!;
  engine.execute({
    type: "updateLayers",
    ids: ["layer"],
    patch: {
      effects: page.layers[0]!.effects.map((effect) =>
        animation.effectIds.includes(effect.id) ? { ...effect, inputs: { map: "map" } } : effect,
      ),
    },
  });
  page = engine.getSnapshot().project.pages[0]!;
  expect(
    captureMotionAnimationPreset(page, "layer", animation, "Displace", "captured").effects[0],
  ).not.toHaveProperty("inputs");
});
