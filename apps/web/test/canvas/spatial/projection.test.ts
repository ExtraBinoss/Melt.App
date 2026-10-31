import { expect, test } from "vitest";
import {
  createLayer,
  createPage,
  createLayerGeometryIndex,
  createSpatialScene,
  transformPoint,
} from "@musart/core";
import { Vector3 } from "three/webgpu";
import { createSpatialCamera } from "@musart/render/spatial";
import { projectLayerCamera } from "../../../src/canvas/spatial/projection";
test("the native gizmo camera follows a rotated, scaled classic layer and all its ancestors", () => {
  const group = createLayer("group", {
    id: "group",
    x: 80,
    y: 40,
    width: 600,
    height: 400,
    rotation: 24,
    scaleX: 1.1,
    scaleY: 0.9,
  });
  const layer = createLayer("rectangle", {
    id: "object",
    parentId: group.id,
    x: 120,
    y: 60,
    width: 300,
    height: 160,
    rotation: -15,
  });
  const page = createPage({ width: 1200, height: 800, layers: [group, layer] });
  for (const projection of ["perspective", "orthographic"] as const) {
    const source = createSpatialCamera(
      { ...createSpatialScene().camera, projection },
      layer.width / layer.height,
    );
    const destination = source.clone();
    projectLayerCamera(source, destination, page, layer);
    const original = new Vector3(0.2, 0.4, 0.1).project(source),
      projected = new Vector3(0.2, 0.4, 0.1).project(destination);
    const point = transformPoint(createLayerGeometryIndex(page).worldMatrix(layer.id), {
      x: ((original.x + 1) * layer.width) / 2,
      y: ((1 - original.y) * layer.height) / 2,
    });
    expect(projected.x).toBeCloseTo((point.x / page.width) * 2 - 1, 10);
    expect(projected.y).toBeCloseTo(1 - (point.y / page.height) * 2, 10);
    expect(
      new Vector3(projected.x, projected.y, projected.z)
        .unproject(destination)
        .distanceTo(new Vector3(0.2, 0.4, 0.1)),
    ).toBeLessThan(1e-9);
  }
});
