import { expect, test } from "vitest";
import {
  SPATIAL_PRIMITIVES,
  createSpatialLayer,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  parseProject,
  serializeProject,
} from "../../src/index";
test("every native geometry identifier survives portable validation and rejects unknown sources atomically", () => {
  for (const source of SPATIAL_PRIMITIVES) {
    const project = createProject({
      pages: [
        createPage({ layers: [createLayer("rectangle", { spatial: createSpatialLayer(source) })] }),
      ],
    });
    expect(parseProject(serializeProject(project)).pages[0]!.layers[0]!.spatial!.source).toBe(
      source,
    );
    const engine = new EditorEngine(project),
      before = engine.getSnapshot(),
      layer = before.project.pages[0]!.layers[0]!;
    expect(() =>
      engine.execute({
        type: "updateLayers",
        ids: [layer.id],
        patch: { spatial: { ...layer.spatial!, source: "unknown" as typeof source } },
      }),
    ).toThrow();
    expect(engine.getSnapshot()).toBe(before);
  }
});
