import { expect, it } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
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
