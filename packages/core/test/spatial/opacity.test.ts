import { expect, test } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  EditorEngine,
  selectionComposition,
} from "../../src/index";

test("native layer and group alpha remain separate from material alpha through commands, history and selection export", () => {
  const material = { ...createSpatialLayer("box").material, opacity: 0.7 };
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          layers: [
            createLayer("group", {
              id: "fade",
              opacity: 0.5,
              spatial: createSpatialLayer("group"),
            }),
            createLayer("rectangle", {
              id: "front",
              parentId: "fade",
              width: 100,
              height: 100,
              spatial: { ...createSpatialLayer("box"), material },
            }),
            createLayer("rectangle", {
              id: "rear",
              width: 100,
              height: 100,
              spatial: createSpatialLayer("box"),
            }),
          ],
        }),
      ],
    }),
  );
  const page = () => engine.getSnapshot().project.pages[0]!;
  engine.execute({ type: "updateLayers", ids: ["front"], patch: { opacity: 0.4 } });
  expect(page().layers.find((layer) => layer.id === "front")).toMatchObject({
    opacity: 0.4,
    spatial: { material: { opacity: 0.7 } },
  });
  const selected = selectionComposition(page(), ["front"]);
  expect(selected.layers.find((layer) => layer.id === "fade")).toMatchObject({ opacity: 0.5 });
  expect(selected.layers.find((layer) => layer.id === "front")).toMatchObject({
    opacity: 0.4,
    parentId: "fade",
    spatial: { material: { opacity: 0.7 } },
  });
  expect(selected.layers.find((layer) => layer.id === "rear")).toMatchObject({
    spatialContext: true,
    opacity: 1,
  });
  const before = engine.getSnapshot();
  expect(() =>
    engine.execute({
      type: "updateLayerPatches",
      patches: [
        { id: "fade", patch: { opacity: 0.2 } },
        { id: "front", patch: { opacity: Number.NaN } },
      ],
    }),
  ).toThrow();
  expect(engine.getSnapshot()).toBe(before);
  engine.undo();
  expect(page().layers.find((layer) => layer.id === "front")!.opacity).toBe(1);
  expect(page().layers.find((layer) => layer.id === "fade")!.opacity).toBe(0.5);
  engine.redo();
  expect(page().layers.find((layer) => layer.id === "front")!.opacity).toBe(0.4);
  expect(page().layers.find((layer) => layer.id === "front")!.spatial!.material.opacity).toBe(0.7);
});
