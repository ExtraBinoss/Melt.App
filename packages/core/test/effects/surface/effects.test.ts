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
for (const type of ["ink-bleed", "pixel-sort", "edge-detect"] as const)
  test(`${type} owns validated still-image parameters and atomic undo/redo without introducing animation`, () => {
    const effect = createEffect(type, { id: "fx" });
    const definition = getEffectDefinition(type);
    expect(definition.parameters.some((p) => p.key === "time" || p.key === "speed")).toBe(false);
    const engine = new EditorEngine(
      createProject({
        assets: {
          image: {
            id: "image",
            name: "Image",
            mime: "image/png",
            width: 1,
            height: 1,
            dataUrl:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9WQAAAAASUVORK5CYII=",
          },
        },
        pages: [
          createPage({
            layers: [createLayer("image", { id: "item", assetId: "image", effects: [effect] })],
          }),
        ],
      }),
    );
    const before = engine.getSnapshot().project;
    for (const p of definition.parameters) expect(getEffectParameter(effect, p)).toBeDefined();
    const parameter = definition.parameters.find(
      (p) => p.kind === "number" && p.scope === "settings",
    )!;
    if (parameter.kind !== "number") throw Error("Missing parameter");
    engine.execute({
      type: "updateLayers",
      ids: ["item"],
      patch: {
        effects: [{ ...effect, ...patchEffectParameter(effect, parameter, parameter.max) }],
      },
    });
    const after = engine.getSnapshot().project;
    validateProject(JSON.parse(JSON.stringify(after)));
    expect(after.pages[0]!.motion?.mode).not.toBe("motion");
    engine.undo();
    expect(engine.getSnapshot().project).toEqual(before);
    engine.redo();
    expect(engine.getSnapshot().project).toEqual(after);
    expect(() =>
      engine.execute({
        type: "updateLayers",
        ids: ["item"],
        patch: { effects: [{ ...effect, settings: { [parameter.key]: Infinity } }] },
      }),
    ).toThrow();
    expect(() =>
      engine.execute({
        type: "updateLayers",
        ids: ["item"],
        patch: { effects: [{ ...effect, settings: { unknown: 1 } }] },
      }),
    ).toThrow();
    expect(engine.getSnapshot().project).toEqual(after);
  });
test("rejects unsupported sorting lengths and kernel names without altering the document", () => {
  for (const effect of [
    createEffect("pixel-sort", { settings: { window: "1000000" } }),
    createEffect("edge-detect", { settings: { method: "canny" } }),
  ])
    expect(() =>
      validateProject(
        createProject({
          pages: [createPage({ layers: [createLayer("rectangle", { effects: [effect] })] })],
        }),
      ),
    ).toThrow();
});
