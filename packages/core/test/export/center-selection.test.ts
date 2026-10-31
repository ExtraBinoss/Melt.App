import { expect, test } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  selectionComposition,
  getWorldBounds,
  validateProject,
} from "../../src/index";
test("centers one transformed subtree in the authored artboard without mutating original or mask dependencies", () => {
  const group = createLayer("group", {
    id: "g",
    x: 35,
    y: 20,
    width: 150,
    height: 100,
    rotation: 32,
    scaleX: 1.2,
    opacity: 0.7,
  });
  const child = createLayer("rectangle", {
    id: "c",
    parentId: "g",
    x: 12,
    y: 19,
    width: 80,
    height: 40,
    mask: { enabled: true, layerId: "mask", inverted: false },
  });
  const mask = createLayer("ellipse", {
    id: "mask",
    x: 40,
    y: 15,
    width: 100,
    height: 80,
    maskSource: true,
  });
  const page = createPage({ width: 400, height: 240, layers: [group, child, mask] }),
    before = structuredClone(page);
  const centered = selectionComposition(page, [child.id], [], { centerInArtboard: true });
  const bounds = getWorldBounds(centered, child.id);
  expect(bounds.x + bounds.width / 2).toBeCloseTo(200);
  expect(bounds.y + bounds.height / 2).toBeCloseTo(120);
  expect(centered).toMatchObject({ width: 400, height: 240, background: "transparent" });
  const copied = centered.layers.find(
    (layer) => layer.id === centered.layers.find((layer) => layer.id === child.id)!.mask!.layerId,
  )!;
  const beforeMask = getWorldBounds(page, mask.id),
    afterMask = getWorldBounds(centered, copied.id),
    original = getWorldBounds(page, child.id);
  expect(afterMask.x - bounds.x).toBeCloseTo(beforeMask.x - original.x);
  expect(afterMask.y - bounds.y).toBeCloseTo(beforeMask.y - original.y);
  expect(centered.layers.find((layer) => layer.id === group.id)!.opacity).toBe(0.7);
  validateProject(createProject({ pages: [centered] }));
  expect(page).toEqual(before);
});
test("centering is opt-in and ignored for multiple selected layers", () => {
  const a = createLayer("rectangle", { id: "a", x: 12.5, y: 21.5, width: 80, height: 40 });
  const b = createLayer("ellipse", { id: "b", x: 200, y: 100, width: 40, height: 40 });
  const page = createPage({ width: 400, height: 240, layers: [a, b] });
  expect(selectionComposition(page, [a.id])).toMatchObject({ width: 81, height: 41 });
  const centered = selectionComposition(page, [a.id], [], { centerInArtboard: true });
  expect(centered.layers[0]).toMatchObject({ x: 160, y: 100, width: 80, height: 40 });
  expect(selectionComposition(page, [a.id, b.id], [], { centerInArtboard: true })).toEqual(
    selectionComposition(page, [a.id, b.id]),
  );
});
