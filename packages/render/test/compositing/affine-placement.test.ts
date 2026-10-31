import { expect, it, vi } from "vitest";
import { createLayer, createPage, layerTransform, transformPoint } from "@musart/core";
import {
  InstancedMesh,
  Matrix4,
  Mesh,
  RenderTarget,
  Texture,
  Vector3,
  type Scene,
} from "three/webgpu";
import { sourcePlacement } from "../../src/compositing/group-viewport";
import { placementMatrix } from "../../src/compositing/placement-matrix";
import { PrimitiveBatch } from "../../src/compositing/primitives/batch";
import { NormalBatch } from "../../src/compositing/normal-batch";
import { GpuCompositor } from "../../src/compositing/GpuCompositor";
import { makeGpuRenderer } from "../gpu-fixture";
import { installCanvasMock } from "../canvas-fixture";

const fixture = () =>
  createLayer("rectangle", {
    id: "shape",
    x: 40,
    y: 60,
    width: 80,
    height: 50,
    rotation: 28,
    scaleX: 1.4,
    scaleY: 0.6,
    affine: [-1, 0.3, 0.8, 1],
  });
const corners = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

it("keeps the complete reflected/sheared crop mapping and parent viewport origin", () => {
  const layer = fixture(),
    region = { x: 7, y: 8, width: 30, height: 20 },
    origin = { x: 13, y: 19 };
  const before = structuredClone(layer),
    placed = sourcePlacement(layer, region, origin),
    matrix = placementMatrix(new Matrix4(), placed);
  for (const point of corners) {
    const expected = transformPoint(layerTransform(layer), {
      x: region.x + point.x * region.width,
      y: region.y + point.y * region.height,
    });
    const actual = new Vector3(point.x - 0.5, 0.5 - point.y, 0).applyMatrix4(matrix);
    expect(actual.x).toBeCloseTo(expected.x - origin.x, 10);
    expect(actual.y).toBeCloseTo(expected.y - origin.y, 10);
  }
  expect(layer).toEqual(before);
});

it("uses the same complete quad transform for normal and instanced primitive paths", () => {
  const { renderer, fake } = makeGpuRenderer(),
    primitive = new PrimitiveBatch(renderer),
    normal = new NormalBatch(renderer),
    target = new RenderTarget(320, 240),
    texture = new Texture(),
    layer = fixture();
  const origin = { x: 12, y: 21 },
    expected = placementMatrix(new Matrix4(), layer, origin);
  primitive.draw([layer], 320, 240, 1, target, origin);
  const instances = (fake.render.mock.calls.at(-1)![0] as Scene).children[0] as InstancedMesh;
  const actual = new Matrix4();
  instances.getMatrixAt(0, actual);
  actual.elements.forEach((value, i) => expect(value).toBeCloseTo(expected.elements[i]!, 4));
  normal.draw(
    [{ layer, source: { texture, width: 80, height: 50, premultiplied: true } }],
    320,
    240,
    target,
    origin,
  );
  const mesh = (fake.render.mock.calls.at(-1)![0] as Scene).children[0] as Mesh;
  mesh.matrix.elements.forEach((value, i) => expect(value).toBeCloseTo(expected.elements[i]!, 10));
  expect(mesh.matrixAutoUpdate).toBe(false);
  expect(mesh.frustumCulled).toBe(false);
  // A retained normal item can return to an ordinary authored TRS frame.
  const ordinary = { ...layer };
  delete ordinary.affine;
  normal.draw(
    [{ layer: ordinary, source: { texture, width: 80, height: 50, premultiplied: true } }],
    320,
    240,
    target,
  );
  expect(mesh.matrixAutoUpdate).toBe(true);
  expect(mesh.frustumCulled).toBe(true);
  primitive.dispose();
  normal.dispose();
  target.dispose();
  texture.dispose();
});

it("invalidates a retained root primitive composition when only its affine basis changes", async () => {
  installCanvasMock();
  const { renderer } = makeGpuRenderer(),
    graph = new GpuCompositor(renderer),
    layer = fixture(),
    page = createPage({ width: 320, height: 240, layers: [layer] });
  try {
    await graph.render(page, {});
    const first = graph.stats().passes;
    await graph.render(page, {});
    expect(graph.stats().passes).toBe(first);
    await graph.render({ ...page, layers: [{ ...layer, affine: [1, 0, 0.4, 1] }] }, {});
    expect(graph.stats().passes).toBeGreaterThan(first);
  } finally {
    await graph.dispose();
    vi.restoreAllMocks();
  }
});
