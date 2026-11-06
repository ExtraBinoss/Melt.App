import { expect, it } from "vitest";
import {
  captureEffectTreatment,
  createEffect,
  createLayer,
  createPage,
  createProject,
  effectMatchesTreatment,
  EditorEngine,
  parseProject,
  serializeProject,
} from "@musart/core";
import { applyTreatment } from "../../../src/services/effect-presets/apply";
function fixture() {
  const effect = createEffect("risograph", { id: "ink-effect", settings: { inkA: "#17404c" } });
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "poster-page",
          layers: [createLayer("rectangle", { id: "poster-layer", effects: [effect] })],
        }),
      ],
    }),
  );
  engine.select(["poster-layer"]);
  const read = () => engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!;
  const treatment = captureEffectTreatment(
    "personal-print",
    "Company print",
    [read()],
    {},
    "effect",
  );
  return { engine, read, treatment };
}
it("global effect colors mark a preset modified; restoring it detaches the color and Undo restores the live link", () => {
  const { engine, read, treatment } = fixture();
  engine.transaction([
    {
      type: "setDocumentColors",
      colors: [{ id: "company-ink", name: "Company ink", value: "#17404c" }],
    },
    {
      type: "linkDocumentColor",
      targets: [
        {
          pageId: "poster-page",
          layerId: "poster-layer",
          effectId: "ink-effect",
          property: "inkA",
        },
      ],
      colorId: "company-ink",
    },
  ]);
  expect(effectMatchesTreatment(read(), treatment)).toBe(true);
  engine.execute({
    type: "setDocumentColors",
    colors: [{ id: "company-ink", name: "Company ink", value: "#bf6935" }],
  });
  expect(read().settings?.inkA).toBe("#bf6935");
  expect(effectMatchesTreatment(read(), treatment)).toBe(false);
  applyTreatment(
    engine,
    engine.getSnapshot(),
    { pageId: "poster-page", layerIds: ["poster-layer"], effectId: "ink-effect" },
    treatment,
    "replace",
  );
  expect(read().settings?.inkA).toBe("#17404c");
  expect(read().colorLinks).toBeUndefined();
  expect(read().preset).toEqual({ id: treatment.id, name: treatment.name });
  engine.undo();
  expect(read().settings?.inkA).toBe("#bf6935");
  expect(read().colorLinks).toEqual({ inkA: "company-ink" });
  engine.execute({
    type: "setDocumentColors",
    colors: [{ id: "company-ink", name: "Company ink", value: "#228f86" }],
  });
  expect(read().settings?.inkA).toBe("#228f86");
});
it("personal treatments remain portable independently of document colors, with preset restoration references preserved", () => {
  const { engine, read, treatment } = fixture();
  engine.execute({
    type: "setDocumentColors",
    colors: [{ id: "company-ink", name: "Company ink", value: "#17404c" }],
  });
  engine.execute({
    type: "linkDocumentColor",
    targets: [
      { pageId: "poster-page", layerId: "poster-layer", effectId: "ink-effect", property: "inkA" },
    ],
    colorId: "company-ink",
  });
  const captured = captureEffectTreatment(
    "personal-linked-print",
    "Portable print",
    [read()],
    {},
    "effect",
  );
  expect(captured.effects[0]!.colorLinks).toBeUndefined();
  applyTreatment(
    engine,
    engine.getSnapshot(),
    { pageId: "poster-page", layerIds: ["poster-layer"], effectId: "ink-effect" },
    treatment,
    "replace",
  );
  const restored = parseProject(serializeProject(engine.getSnapshot().project));
  expect(restored.colors?.[0]?.name).toBe("Company ink");
  expect(restored.pages[0]!.layers[0]!.effects[0]!.preset).toEqual({
    id: treatment.id,
    name: treatment.name,
  });
});
