import { expect, test } from "vitest";
import {
  createLayer,
  createPage,
  createSpatialLayer,
  createSpatialScene,
  SpatialGeometry,
} from "@musart/core";
import { BoxGeometry, Group, WebGLCoordinateSystem } from "three/webgpu";
import { SpatialResource } from "../../src/spatial/SpatialResource";
import { pickSpatialLayer } from "../../src/spatial/picking";
test("triangle picking resolves shared depth independently of layer order, respects locks and disposes missing sources", () => {
  const scene = createSpatialScene();
  scene.camera.yaw = 0;
  scene.camera.pitch = 0;
  const front = createLayer("rectangle", {
    id: "front",
    x: 0,
    y: 0,
    width: 256,
    height: 256,
    spatial: { ...createSpatialLayer("box"), z: 0.5 },
  });
  const back = createLayer("rectangle", {
    id: "back",
    x: 0,
    y: 0,
    width: 256,
    height: 256,
    spatial: { ...createSpatialLayer("box"), z: -0.5 },
  });
  const page = createPage({ width: 256, height: 256, spatial: scene, layers: [front, back] });
  const resources = new Map<string, SpatialResource>();
  const geometry = new SpatialGeometry(page);
  for (const layer of page.layers) {
    const resource = SpatialResource.primitive(new BoxGeometry(1, 1, 1), scene, layer);
    resource.update(layer, scene, null, 1, 1);
    const anchor = new Group();
    anchor.matrixAutoUpdate = false;
    anchor.matrix.fromArray(geometry.anchorMatrix(layer.id));
    anchor.add(resource.root);
    anchor.updateMatrixWorld(true);
    resources.set(layer.id, resource);
  }
  const source = (id: string) => resources.get(id) ?? null;
  try {
    expect(pickSpatialLayer(page, { x: 128, y: 128 }, source, WebGLCoordinateSystem)).toBe("front");
    expect(
      pickSpatialLayer(
        { ...page, layers: [back, front] },
        { x: 128, y: 128 },
        source,
        WebGLCoordinateSystem,
      ),
    ).toBe("front");
    front.locked = true;
    expect(pickSpatialLayer(page, { x: 128, y: 128 }, source, WebGLCoordinateSystem)).toBe("back");
    expect(pickSpatialLayer(page, { x: 128, y: 128 }, source, WebGLCoordinateSystem, true)).toBe(
      "front",
    );
    expect(pickSpatialLayer(page, { x: 0, y: 0 }, source, WebGLCoordinateSystem, true)).toBeNull();
    resources.get("front")!.dispose();
    expect(
      pickSpatialLayer(page, { x: 128, y: 128 }, source, WebGLCoordinateSystem, true),
    ).toBeUndefined();
  } finally {
    for (const resource of resources.values()) resource.dispose();
  }
});
