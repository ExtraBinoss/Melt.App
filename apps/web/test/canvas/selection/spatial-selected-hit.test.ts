import { expect, test, vi } from "vitest";
import {
  createLayer,
  createPage,
  createSpatialLayer,
  createSpatialScene,
  SpatialGeometry,
} from "@musart/core";
import {
  BoxGeometry,
  SphereGeometry,
  Group,
  WebGLCoordinateSystem,
  type WebGPURenderer,
} from "three/webgpu";
import { SpatialResource } from "../../../../../packages/render/src/spatial/SpatialResource";
import {
  canvasNativeRenderer,
  canvasSpatialSource,
} from "../../../src/canvas/render/plane-resources";
import { canvasHit, canvasSelectionHit } from "../../../src/canvas/selection/hit";

vi.mock("../../../src/canvas/render/plane-resources", () => ({
  canvasNativeRenderer: vi.fn(),
  canvasSpatialSource: vi.fn(),
}));

test("a selected native source raycasts its real triangles through a nearer mesh without bounds fallback", () => {
  const scene = createSpatialScene();
  scene.camera.yaw = 0;
  scene.camera.pitch = 0;
  const page = createPage({
    id: "native-pick",
    width: 256,
    height: 256,
    spatial: scene,
    layers: [
      createLayer("rectangle", {
        id: "back",
        x: 0,
        y: 0,
        width: 256,
        height: 256,
        spatial: { ...createSpatialLayer("sphere"), z: -0.5 },
      }),
      createLayer("rectangle", {
        id: "front",
        x: 0,
        y: 0,
        width: 256,
        height: 256,
        spatial: { ...createSpatialLayer("box"), z: 0.5 },
      }),
    ],
  });
  const resources = new Map<string, SpatialResource>(),
    geometry = new SpatialGeometry(page);
  for (const layer of page.layers) {
    const resource = SpatialResource.primitive(
      layer.id === "back" ? new SphereGeometry(0.5, 32, 24) : new BoxGeometry(1, 1, 1),
      scene,
      layer,
    );
    resource.update(layer, scene, null, 1, 1);
    const anchor = new Group();
    anchor.matrixAutoUpdate = false;
    anchor.matrix.fromArray(geometry.anchorMatrix(layer.id));
    anchor.add(resource.root);
    anchor.updateMatrixWorld(true);
    resources.set(layer.id, resource);
  }
  const host = document.createElement("div");
  host.className = "editor-gpu-scene";
  const canvas = document.createElement("canvas");
  canvas.dataset.pageId = page.id;
  canvas.dataset.presentationReady = "true";
  host.append(canvas);
  document.body.append(host);
  vi.mocked(canvasNativeRenderer).mockReturnValue({
    coordinateSystem: WebGLCoordinateSystem,
  } as WebGPURenderer);
  vi.mocked(canvasSpatialSource).mockImplementation((_canvas, id) => resources.get(id) ?? null);
  try {
    expect(canvasHit(page, { x: 128, y: 128 }, true)?.layer.id).toBe("front");
    expect(canvasSelectionHit(page, { x: 128, y: 128 }, ["back"])?.layer.id).toBe("back");
    expect(canvasSelectionHit(page, { x: 0, y: 0 }, ["back"])?.layer.id).not.toBe("back");
    resources.get("back")!.dispose();
    expect(canvasSelectionHit(page, { x: 128, y: 128 }, ["back"])?.layer.id).toBe("front");
  } finally {
    host.remove();
    for (const resource of resources.values()) resource.dispose();
    vi.resetAllMocks();
  }
});
