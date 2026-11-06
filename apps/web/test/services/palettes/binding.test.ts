import { expect, it } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  EditorEngine,
} from "@musart/core";
import type { FillGradient } from "@musart/core";
import { paletteVariation } from "../../../src/services/palettes/binding";
it("previews every explicit global use without changing documents or matching equal local values", () => {
  const engine = new EditorEngine(
    createProject({
      colors: [{ id: "brand", name: "Brand", value: "#a64433" }],
      pages: [
        createPage({
          id: "page",
          layers: [
            createLayer("rectangle", {
              id: "linked",
              fill: "#a64433",
              colorLinks: { fill: "brand" },
            }),
            createLayer("rectangle", { id: "local", fill: "#a64433" }),
          ],
        }),
      ],
    }),
  );
  const before = engine.getSnapshot(),
    result = paletteVariation(before, [{ id: "brand", name: "Brand", value: "#336688" }]);
  expect(result.preview!.layers![0]!.fill).toBe("#336688");
  expect(result.preview!.layers![1]!.fill).toBe("#a64433");
  expect(engine.getSnapshot()).toBe(before);
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.fill).toBe("#a64433");
  expect(
    paletteVariation(before, [{ id: "different", name: "Same literal", value: "#a64433" }]),
  ).toEqual({ globals: [], preview: null });
});

it("replaces addressed gradient and original-material paints with solid ink, retaining unrelated paints and one undo", () => {
  const gradient: FillGradient = {
    kind: "linear",
    angle: 0,
    stops: [
      { offset: 0, color: "#ff0000" },
      { offset: 1, color: "#0000ff" },
    ],
  };
  const engine = new EditorEngine(
    createProject({
      colors: [{ id: "brand", name: "Brand", value: "#a64433" }],
      pages: [
        createPage({
          id: "page",
          backgroundGradient: gradient,
          layers: [
            createLayer("text", {
              id: "linked",
              fill: "#a64433",
              fillGradient: gradient,
              colorLinks: { fill: "brand" },
              spatial: { ...createSpatialLayer("extrude"), useModelMaterials: true },
            }),
            createLayer("vector", {
              id: "vector",
              vector: {
                viewBox: "0 0 10 10",
                preserveColors: true,
                parts: [{ path: "M0 0H10V10H0Z", fill: "#ff0000" }],
              },
            }),
            createLayer("rectangle", { id: "untouched", fillGradient: gradient }),
          ],
        }),
      ],
    }),
  );
  const before = engine.getSnapshot();
  const result = paletteVariation(
    before,
    [{ id: "brand", name: "Brand", value: "#336688" }],
    [
      { pageId: "page", layerId: "linked", property: "fill" },
      { pageId: "page", layerId: "vector", property: "fill" },
      { pageId: "page", property: "background" },
    ],
  );
  expect(result.preview!.backgroundGradient).toBeUndefined();
  expect(result.preview!.layers![0]!.fillGradient).toBeUndefined();
  expect(result.preview!.layers![0]!.spatial!.useModelMaterials).toBe(false);
  expect(result.preview!.layers![1]!.vector!.preserveColors).toBe(false);
  expect(result.preview!.layers![2]!.fillGradient).toEqual(gradient);
  engine.transaction([{ type: "setDocumentColors", colors: result.globals }, ...result.commands!]);
  const page = engine.getSnapshot().project.pages[0]!;
  expect(page.backgroundGradient).toBeUndefined();
  expect(page.layers[0]!.fillGradient).toBeUndefined();
  expect(page.layers[0]!.spatial!.useModelMaterials).toBe(false);
  expect(page.layers[0]!.colorLinks).toEqual({ fill: "brand" });
  expect(page.layers[1]!.vector!.preserveColors).toBe(false);
  expect(page.layers[2]!.fillGradient).toEqual(gradient);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before.project);
});
it("previews an explicitly addressed local target when saved IDs differ, leaving equal literals and document globals independent", () => {
  const engine = new EditorEngine(
    createProject({
      colors: [{ id: "other", name: "Other", value: "#a64433" }],
      pages: [
        createPage({
          id: "page",
          layers: [
            createLayer("rectangle", { id: "one", fill: "#a64433", colorLinks: { fill: "other" } }),
            createLayer("rectangle", { id: "two", fill: "#a64433" }),
          ],
        }),
      ],
    }),
  );
  const before = engine.getSnapshot();
  const result = paletteVariation(
    before,
    [{ id: "unrelated-swatch", name: "Saved", value: "#336688" }],
    [{ pageId: "page", layerId: "one", property: "fill" }],
  );
  expect(result.globals).toEqual([]);
  expect(result.preview!.layers![0]!.fill).toBe("#336688");
  expect(result.preview!.layers![1]!.fill).toBe("#a64433");
  expect(engine.getSnapshot()).toBe(before);
  expect(before.project.colors![0]!.value).toBe("#a64433");
  engine.transaction(result.commands!);
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.fill).toBe("#336688");
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.colorLinks).toBeUndefined();
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before.project);
});
it("applies matching globals and an independently addressed target in one transaction without changing equal local colors", () => {
  const engine = new EditorEngine(
    createProject({
      colors: [
        { id: "other", name: "Other", value: "#a64433" },
        { id: "saved", name: "Saved", value: "#a64433" },
      ],
      pages: [
        createPage({
          id: "page",
          layers: [
            createLayer("rectangle", {
              id: "addressed",
              fill: "#a64433",
              colorLinks: { fill: "other" },
            }),
            createLayer("rectangle", { id: "local", fill: "#a64433" }),
            createLayer("rectangle", {
              id: "global",
              fill: "#a64433",
              colorLinks: { fill: "saved" },
            }),
          ],
        }),
      ],
    }),
  );
  const before = engine.getSnapshot().project,
    result = paletteVariation(
      engine.getSnapshot(),
      [{ id: "saved", name: "Saved", value: "#336688" }],
      [{ pageId: "page", layerId: "addressed", property: "fill" }],
    );
  expect(result.preview!.layers!.map((layer) => layer.fill)).toEqual([
    "#336688",
    "#a64433",
    "#336688",
  ]);
  engine.transaction([{ type: "setDocumentColors", colors: result.globals }, ...result.commands!]);
  const layers = engine.getSnapshot().project.pages[0]!.layers;
  expect(layers.map((layer) => layer.fill)).toEqual(["#336688", "#a64433", "#336688"]);
  expect(layers[0]!.colorLinks).toBeUndefined();
  expect(layers[2]!.colorLinks).toEqual({ fill: "saved" });
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
});
