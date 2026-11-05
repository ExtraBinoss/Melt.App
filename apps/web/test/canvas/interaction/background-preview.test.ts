import { expect, test } from "vitest";
import { backgroundLayer, createLayer, createPage } from "@musart/core";
import { applyPreview } from "../../../src/canvas/interaction/gestures";

test("a resized custom-named full-frame background keeps its paint owner throughout the preview, without mutating the document", () => {
  const layer = createLayer("rectangle", { id: "wall", name: "My wall", width: 320, height: 240 });
  const page = createPage({ width: 320, height: 240, background: "#8844ff", layers: [layer] });
  const before = structuredClone(page);
  const preview = applyPreview(page, [
    { layerId: layer.id, patch: { background: true, x: 80, width: 240 } },
  ]);
  expect(preview.layers[0]).toMatchObject({ background: true, x: 80, width: 240 });
  expect(backgroundLayer(preview)?.id).toBe(layer.id);
  expect(page).toEqual(before);
  expect(applyPreview(page, [])).toBe(page);
});
