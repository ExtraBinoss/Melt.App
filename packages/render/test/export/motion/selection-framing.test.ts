import { expect, test } from "vitest";
import { createLayer, createPage } from "@musart/core";
import { selectionFrameScope } from "../../../src/export/motion/selection";
test("centered motion/replay framing keeps a fixed offset and authored dimensions as the layer moves or disappears", () => {
  const layer = createLayer("rectangle", { id: "a", x: 20, y: 30, width: 80, height: 40 });
  const page = createPage({ width: 320, height: 240, layers: [layer] });
  const scope = selectionFrameScope(page, [layer.id], true);
  expect(scope.page).toMatchObject({ width: 320, height: 240 });
  expect(scope.page.layers[0]).toMatchObject({ x: 120, y: 100 });
  const moved = scope.frame({ ...page, layers: [{ ...layer, x: 45, y: 10 }] });
  expect(moved).toMatchObject({ width: 320, height: 240 });
  expect(moved.layers[0]).toMatchObject({ x: 145, y: 80 });
  expect(scope.frame({ ...page, layers: [] })).toMatchObject({
    width: 320,
    height: 240,
    layers: [],
  });
  expect(selectionFrameScope(page, [layer.id]).page).toMatchObject({ width: 80, height: 40 });
});
