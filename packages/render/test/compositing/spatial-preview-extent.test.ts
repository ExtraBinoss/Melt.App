import { expect, it } from "vitest";
import {
  createLayer,
  createPage,
  createSpatialLayer,
  createSpatialScene,
  SpatialGeometry,
} from "@musart/core";
import { Group, Mesh, Matrix4 } from "three/webgpu";
import { spatialPreviewExtents } from "../../src/compositing/spatial-preview-extent";
import { estimatePreviewCost } from "../../src/compositing/preview-cost";
import { spatialPrimitiveGeometry } from "../../src/spatial/primitives";
import {
  createSpatialCamera,
  updateCompositionCamera,
  updateSpatialObject,
} from "../../src/spatial/camera";
import { projectedTransport } from "../../src/spatial/scene/projection";

it("conservatively budgets the same projected native AABB crop across layouts and parent transforms", () => {
  for (const source of ["box", "sphere", "torus", "torusKnot", "lathe", "tube"] as const) {
    const parent = createLayer("group", {
      id: "parent",
      width: 1440,
      height: 1080,
      spatial: { ...createSpatialLayer("group"), rotationY: 24, scaleX: 0.8 },
    });
    const layer = createLayer("rectangle", {
      id: "object",
      parentId: parent.id,
      x: 32,
      y: 48,
      width: 1440,
      height: 1080,
      rotation: 12,
      scaleX: 0.9,
      spatial: {
        ...createSpatialLayer(source),
        x: 0.2,
        rotationX: 17,
        rotationY: 23,
        scaleX: 0.25,
        scaleY: 0.3,
        scaleZ: 0.2,
      },
    });
    const scene = createSpatialScene();
    scene.camera = { ...scene.camera, yaw: 15, pitch: 20 };
    const page = createPage({ width: 1440, height: 1080, spatial: scene, layers: [parent, layer] });
    const geometry = new SpatialGeometry(page);
    const nativeGeometry = spatialPrimitiveGeometry({
      ...layer.spatial!,
      source,
      curveSegments: 16,
    })!;
    const root = new Group();
    root.add(new Mesh(nativeGeometry));
    updateSpatialObject(root, layer.spatial!);
    const anchor = new Group();
    anchor.matrixAutoUpdate = false;
    anchor.matrix.copy(new Matrix4().fromArray(geometry.anchorMatrix(layer.id)));
    anchor.add(root);
    anchor.updateMatrixWorld(true);
    const camera = createSpatialCamera(scene.camera, page.width / page.height);
    updateCompositionCamera(camera, page, camera.coordinateSystem);
    const native = projectedTransport(page, layer, root, camera, geometry);
    const estimated = spatialPreviewExtents(page)(layer);
    expect(estimated.width, source).toBeGreaterThanOrEqual(native.width);
    expect(estimated.height, source).toBeGreaterThanOrEqual(native.height);
    expect(estimated.width).toBeLessThan(layer.width / 2);
    nativeGeometry.dispose();
  }
});

it("counts cropped primitive targets, their shared depth and native group children without changing caps", () => {
  const small = createLayer("rectangle", {
    id: "small",
    width: 1440,
    height: 1080,
    spatial: { ...createSpatialLayer("box"), scaleX: 0.2, scaleY: 0.2, scaleZ: 0.2 },
  });
  const page = createPage({ width: 1440, height: 1080, layers: [small] });
  const extent = spatialPreviewExtents(page)(small);
  const cost = estimatePreviewCost(page, 1);
  expect(cost.scaledBytes).toBe(
    1440 * 1080 * (4 * 3 + 8) + Math.ceil(extent.width) * Math.ceil(extent.height) * 60,
  );
  expect(cost.fixedBytes).toBe(40 * 1024 * 1024);
  const large = { ...small, spatial: createSpatialLayer("box") };
  expect(estimatePreviewCost({ ...page, layers: [large] }, 1).bytes).toBeGreaterThan(cost.bytes);
  const parent = createLayer("group", {
    id: "parent",
    width: 1440,
    height: 1080,
    spatial: createSpatialLayer("group"),
  });
  const grouped = { ...page, layers: [parent, { ...small, parentId: parent.id }] };
  expect(estimatePreviewCost(grouped, 1).bytes).toBeGreaterThan(cost.bytes);
  expect(estimatePreviewCost({ ...grouped, layers: [parent] }, 1).fixedBytes).toBe(0);
});
