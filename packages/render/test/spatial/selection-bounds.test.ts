import { expect, test } from "vitest";
import {
  createLayer,
  createPage,
  createSpatialLayer,
  createSpatialScene,
  SpatialGeometry,
} from "@musart/core";
import { Group, Mesh, MeshBasicMaterial } from "three/webgpu";
import { buildSpatialGeometry } from "../../src/spatial/geometry-build";
import { spatialGeometryJob } from "../../src/spatial/outlines";
import { SpatialResource } from "../../src/spatial/SpatialResource";
import { spatialSelectionBounds } from "../../src/spatial/selection-bounds";
import { outlineFont } from "../text-fixture";

test("native text selection uses prepared glyph ink rather than its wrapping frame, and follows changed poses", () => {
  const settings = createSpatialScene();
  settings.camera = { ...settings.camera, projection: "orthographic", yaw: 0, pitch: 0 };
  const layer = createLayer("text", {
    id: "title",
    text: "AV",
    width: 500,
    height: 150,
    fontSize: 60,
    spatial: { ...createSpatialLayer("extrude"), bevel: 0 },
  });
  const page = createPage({ width: 800, height: 600, spatial: settings, layers: [layer] });
  const resource = new SpatialResource(
    new Mesh(
      buildSpatialGeometry(spatialGeometryJob(layer, outlineFont())),
      new MeshBasicMaterial(),
    ),
    [],
    settings,
  );
  const anchor = new Group();
  anchor.matrixAutoUpdate = false;
  anchor.matrix.fromArray(new SpatialGeometry(page).anchorMatrix(layer.id));
  anchor.add(resource.root);
  anchor.updateMatrixWorld(true);
  try {
    const bounds = spatialSelectionBounds(page, layer, resource)!;
    expect(bounds.width).toBeGreaterThan(20);
    expect(bounds.width).toBeLessThan(layer.width / 2);
    expect(bounds.height).toBeLessThan(layer.height);
    expect(spatialSelectionBounds(page, layer, resource)).toBe(bounds);
    const moved = { ...layer, spatial: { ...layer.spatial!, x: 0.2 } };
    const preview = { ...page, layers: [moved] };
    expect(spatialSelectionBounds(preview, moved, resource)!.x).toBeGreaterThan(bounds.x);
  } finally {
    resource.dispose();
  }
  expect(spatialSelectionBounds(page, layer, resource)).toBeNull();
});

test("empty prepared text retains a finite authored fallback instead of projecting infinite boxes", () => {
  const settings = createSpatialScene(),
    layer = createLayer("text", { text: "", spatial: createSpatialLayer("extrude") }),
    page = createPage({ layers: [layer] }),
    resource = new SpatialResource(
      new Mesh(buildSpatialGeometry(spatialGeometryJob(layer))),
      [],
      settings,
    );
  try {
    expect(spatialSelectionBounds(page, layer, resource)).toBeNull();
  } finally {
    resource.dispose();
  }
});
