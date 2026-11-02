import { expect, it } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  createEffect,
  EditorEngine,
  getWorldMatrix,
  transformPoint,
} from "@musart/core";
import { copySelectionCommands } from "../../../../src/services/selection/wand/copy-commands";
it("places a tight pixel crop exactly over its source through nested reflected/sheared transforms and preserves the original clip", () => {
  const source = {
    id: "source",
    name: "Source",
    mime: "image/png",
    width: 100,
    height: 80,
    dataUrl: "data:image/png;base64,AAAA",
  };
  const crop = { ...source, id: "crop", name: "Crop", width: 20, height: 30 };
  const parent = createLayer("group", {
    id: "parent",
    x: 40,
    y: 50,
    rotation: 27,
    opacity: 0.5,
    scaleX: 1.2,
    affine: [-1, 0, 0, 1],
  });
  const original = createLayer("image", {
    id: "image",
    parentId: "parent",
    assetId: source.id,
    x: 30,
    y: 40,
    width: 200,
    height: 160,
    rotation: -13,
    affine: [1, 0.1, 0.3, 1],
    scaleX: 1.3,
    opacity: 0.7,
    radius: 8,
    mask: { assetId: source.id, mode: "alpha", inverted: true, enabled: true },
    effects: [createEffect("brightness", { id: "brightness" })],
  });
  const top = createLayer("rectangle", { id: "top", parentId: "parent" });
  const page = createPage({ layers: [parent, original, top] });
  const engine = new EditorEngine(createProject({ pages: [page], assets: { source } }));
  engine.select([original.id]);
  const before = engine.getSnapshot();
  engine.transaction(
    copySelectionCommands(
      page,
      original.id,
      crop,
      { x: 15, y: 20, sourceWidth: 100, sourceHeight: 80 },
      "Source copy",
      "Mask",
    ),
  );
  const after = engine.getSnapshot(),
    result = after.project.pages[0]!,
    clone = result.layers.find((layer) => layer.assetId === crop.id)!;
  expect(clone).toMatchObject({ parentId: "parent", width: 40, height: 60, opacity: 0.7 });
  expect(clone.effects[0]!.id).not.toBe("brightness");
  expect(result.layers.indexOf(clone)).toBe(
    result.layers.findIndex((layer) => layer.id === original.id) + 1,
  );
  for (const point of [
    { x: 0, y: 0 },
    { x: 40, y: 60 },
  ]) {
    const actual = transformPoint(getWorldMatrix(result, clone.id), point),
      expected = transformPoint(getWorldMatrix(result, original.id), {
        x: point.x + 30,
        y: point.y + 40,
      });
    expect(actual.x).toBeCloseTo(expected.x, 9);
    expect(actual.y).toBeCloseTo(expected.y, 9);
  }
  const mask = result.layers.find((layer) => layer.id === clone.mask!.layerId)!;
  expect(mask.mask).toEqual(original.mask);
  expect(mask.opacity).toBe(1);
  expect(mask.parentId).toBeNull();
  getWorldMatrix(result, mask.id).forEach((value, index) =>
    expect(value).toBeCloseTo(getWorldMatrix(result, original.id)[index]!, 9),
  );
  expect(result.layers.find((layer) => layer.id === original.id)).toEqual(original);
  expect(after.selection).toEqual([clone.id]);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before.project);
  expect(engine.getSnapshot().selection).toEqual([original.id]);
  expect(engine.getSnapshot().canUndo).toBe(false);
  engine.redo();
  expect(engine.getSnapshot().project).toEqual(after.project);
  expect(engine.getSnapshot().selection).toEqual([clone.id]);
});
