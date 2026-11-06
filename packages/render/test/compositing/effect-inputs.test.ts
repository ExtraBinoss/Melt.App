import { expect, test } from "vitest";
import { createEffect, createLayer, createPage, createLayerGeometryIndex } from "@musart/core";
import { Matrix3, Vector3, Texture } from "three/webgpu";
import {
  effectToComposition,
  historicalEffectBounds,
  historyUvTransform,
} from "../../src/compositing/effect-inputs";
import { CapturePaint } from "../../src/compositing/capture-paint";

test("historical UVs preserve full composition placement through current parent pose and native homography", () => {
  const parent = createLayer("group", { id: "parent", x: 45, y: 30, rotation: 15 }),
    layer = createLayer("text", { id: "child", parentId: parent.id, x: 60, y: 20, scaleX: 1.2 }),
    page = createPage({ layers: [parent, layer] }),
    projection = new Matrix3().set(1.1, 0.1, 12, 0, 0.8, 9, 0.0005, 0, 1),
    transform = effectToComposition(page, layer, projection.elements),
    bounds = { x: -20, y: -10, width: 220, height: 140 },
    capture = { x: 10, y: 15, width: 640, height: 480 },
    uv = new Vector3(0.3, 0.8, 1).applyMatrix3(
      new Matrix3().fromArray(historyUvTransform(transform, bounds, capture)),
    ),
    expected = new Vector3(
      bounds.x + 0.3 * bounds.width,
      bounds.y + 0.2 * bounds.height,
      1,
    ).applyMatrix3(transform);
  expected.multiplyScalar(1 / expected.z);
  expect(uv.x / uv.z).toBeCloseTo((expected.x - capture.x) / capture.width, 10);
  expect(uv.y / uv.z).toBeCloseTo(1 - (expected.y - capture.y) / capture.height, 10);
});

test("historical moving owners expand the current local footprint and absent slots do not add bounds", () => {
  const effect = createEffect("trail"),
    layer = createLayer("rectangle", {
      id: "owner",
      x: 100,
      y: 80,
      width: 40,
      height: 30,
      effects: [effect],
    }),
    page = createPage({ layers: [layer] }),
    texture = new Texture();
  try {
    const history = new Map([
      [
        effect.id,
        [
          {
            texture,
            available: true,
            flipY: true,
            ownerBounds: { x: 20, y: 60, width: 40, height: 30 },
          },
        ],
      ],
    ]);
    expect(historicalEffectBounds(page, layer, history)).toEqual({
      x: -80,
      y: -20,
      width: 40,
      height: 30,
    });
    expect(historicalEffectBounds(page, layer, new Map())).toBeUndefined();
    expect(
      historicalEffectBounds(
        page,
        {
          ...layer,
          effects: [{ ...effect, settings: { expandBounds: false } }],
        },
        history,
      ),
    ).toBeUndefined();
  } finally {
    texture.dispose();
  }
});

test("owner captures retain hierarchy transforms and historical masks while isolating paint without changing native context", () => {
  const parent = createLayer("group", {
      id: "p",
      x: 100,
      opacity: 0.4,
      effects: [createEffect("blur")],
    }),
    owner = createLayer("group", {
      id: "o",
      parentId: "p",
      opacity: 0.5,
      mask: { layerId: "mask", enabled: true, inverted: false },
    }),
    child = createLayer("rectangle", { id: "c", parentId: "o" }),
    neighbour = createLayer("rectangle", { id: "n" }),
    mask = createLayer("rectangle", { id: "mask", maskSource: true }),
    page = createPage({ layers: [parent, owner, child, neighbour, mask] }),
    capture = new CapturePaint(createLayerGeometryIndex(page), owner.id);
  expect(capture.includes(parent.id)).toBe(true);
  expect(capture.includes(child.id)).toBe(true);
  expect(capture.includes(neighbour.id)).toBe(false);
  expect(capture.layer(parent)).toMatchObject({ x: 100, opacity: 1, effects: [], mask: null });
  expect(capture.layer(owner)).toMatchObject({ opacity: 1, mask: owner.mask });
  expect(capture.layer(child)).toBe(child);
  const prepared = capture.preparationPage(page, createLayerGeometryIndex(page));
  expect(prepared.layers.map((layer) => layer.id)).toEqual(["p", "o", "c", "mask"]);
  expect(page.layers).toHaveLength(5);
  expect(parent.opacity).toBe(0.4);
  expect(owner.opacity).toBe(0.5);
  expect(
    new CapturePaint(createLayerGeometryIndex(page), "not-yet-authored").includes(neighbour.id),
  ).toBe(false);
});
