import { expect, test, vi } from "vitest";
import {
  createLayer,
  createLayerGeometryIndex,
  createPage,
  createSpatialLayer,
  createSpatialScene,
  SpatialGeometry,
} from "@musart/core";
import {
  AnimationClip,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  WebGLCoordinateSystem,
} from "three/webgpu";
import { createSpatialCamera, updateCompositionCamera } from "../../src/spatial/camera";
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

test("a known 2D-only geometry snapshot does not scan document layers or query native bounds", () => {
  const page = createPage({
    layers: Array.from({ length: 500 }, (_, at) => createLayer("rectangle", { id: `${at}` })),
  });
  const index = createLayerGeometryIndex(page);
  const source = vi.fn(() => null),
    query = vi.spyOn(index, "queryBounds");
  const scan = vi.spyOn(page.layers, "filter").mockImplementation(() => {
    throw new Error("Unexpected full layer scan");
  });
  try {
    expect(
      pickSpatialLayer(page, { x: 50, y: 50 }, source, WebGLCoordinateSystem, false, index),
    ).toBeUndefined();
    expect(source).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  } finally {
    scan.mockRestore();
  }
});

test("animated imported resources retain native triangle authority outside their static normalized frame", () => {
  const scene = createSpatialScene();
  scene.camera.yaw = 0;
  scene.camera.pitch = 0;
  const layer = createLayer("rectangle", {
    id: "animated",
    x: 0,
    y: 0,
    width: 256,
    height: 256,
    spatial: createSpatialLayer("glb"),
  });
  const far = Array.from({ length: 8 }, (_, at) =>
    createLayer("rectangle", { ...layer, id: `far-${at}`, x: 10000 + at * 1000 }),
  );
  const page = createPage({ width: 256, height: 256, spatial: scene, layers: [layer, ...far] });
  const resource = new SpatialResource(
    new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()),
    [new AnimationClip("move", 1, [])],
    scene,
  );
  const geometry = new SpatialGeometry(page),
    anchor = new Group();
  resource.update(layer, scene, null, 1, 1);
  anchor.matrixAutoUpdate = false;
  anchor.matrix.fromArray(geometry.anchorMatrix(layer.id));
  anchor.add(resource.root);
  resource.content.position.x = 4;
  anchor.updateMatrixWorld(true);
  const resources = new Map([[layer.id, resource]]);
  const rejected = [];
  for (const other of far) {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    rejected.push(vi.spyOn(mesh, "raycast"));
    const prepared = new SpatialResource(mesh, [], scene),
      parent = new Group();
    prepared.update(other, scene, null, 1, 1);
    parent.matrixAutoUpdate = false;
    parent.matrix.fromArray(geometry.anchorMatrix(other.id));
    parent.add(prepared.root);
    parent.updateMatrixWorld(true);
    resources.set(other.id, prepared);
  }
  const camera = createSpatialCamera(scene.camera, 1);
  updateCompositionCamera(camera, page, WebGLCoordinateSystem);
  const position = resource.content.getWorldPosition(new Vector3()).project(camera);
  const point = { x: (position.x + 1) * 128, y: (1 - position.y) * 128 };
  expect(createLayerGeometryIndex(page).queryBounds({ ...point, width: 0, height: 0 })).toEqual([]);
  try {
    expect(
      pickSpatialLayer(page, point, (id) => resources.get(id) ?? null, WebGLCoordinateSystem),
    ).toBe(layer.id);
    for (const raycast of rejected) expect(raycast).not.toHaveBeenCalled();
  } finally {
    for (const prepared of resources.values()) prepared.dispose();
  }
});
