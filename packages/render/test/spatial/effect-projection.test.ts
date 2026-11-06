import { expect, test } from "vitest";
import {
  createLayer,
  createPage,
  createSpatialLayer,
  createSpatialScene,
  invertMatrix,
  SpatialGeometry,
  transformPoint,
} from "@musart/core";
import {
  BoxGeometry,
  BufferGeometry,
  Group,
  Matrix3,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  WebGPUCoordinateSystem,
} from "three/webgpu";
import { createSpatialCamera, updateCompositionCamera } from "../../src/spatial/camera";
import { buildSpatialGeometry } from "../../src/spatial/geometry-build";
import { spatialGeometryJob } from "../../src/spatial/outlines";
import { spatialEffectProjection } from "../../src/spatial/scene/effect-projection";
import { projectedTransport } from "../../src/spatial/scene/projection";
import { outlineFont } from "../text-fixture";

test.each(["perspective", "orthographic"] as const)(
  "%s camera distance and transport crops retain authored native text front-face coordinates",
  (projection) => {
    const parent = createLayer("group", {
      id: "parent",
      x: 30,
      y: 20,
      width: 500,
      height: 300,
      rotation: 13,
      scaleX: 0.9,
      scaleY: 1.1,
      spatial: { ...createSpatialLayer("group"), rotationY: -18, rotationX: 12, z: 0.2 },
    });
    const layer = createLayer("text", {
      id: "text",
      parentId: parent.id,
      text: "AV",
      x: 80,
      y: 70,
      width: 240,
      height: 120,
      fontSize: 60,
      rotation: -7,
      spatial: { ...createSpatialLayer("extrude"), rotationZ: 9, rotationY: 21 },
    });
    const native = buildSpatialGeometry(spatialGeometryJob(layer, outlineFont()));
    const material = new MeshBasicMaterial();
    const content = new Mesh(native, material);
    content.position.set(0.07, -0.03, 0.02);
    content.scale.set(1.1, 0.9, 1.2);
    content.rotation.z = 0.1;
    const root = new Group();
    root.matrixAutoUpdate = false;
    root.add(content);
    try {
      native.computeBoundingBox();
      const front = native.boundingBox!.max.z;
      // The real default extrusion has bevel and depth; z=0 cannot anchor its face.
      expect(front).toBeGreaterThan(layer.spatial!.depth / 2);
      const projected: number[] = [];
      for (const distance of [3.5, 4.5, 8]) {
        const settings = createSpatialScene();
        settings.camera = { ...settings.camera, projection, distance, yaw: 17, pitch: 8 };
        const page = createPage({
          width: 640,
          height: 480,
          layers: [parent, layer],
          spatial: settings,
        });
        const geometry = new SpatialGeometry(page);
        root.matrix.fromArray(geometry.worldMatrix(layer.id));
        root.updateMatrixWorld(true);
        const camera = createSpatialCamera(settings.camera, page.width / page.height);
        updateCompositionCamera(camera, page, WebGPUCoordinateSystem);
        const matrix = spatialEffectProjection(page, layer, content, camera, geometry);
        expect(matrix).toBeDefined();
        const mapping = new Matrix3().fromArray(matrix!);
        const full = projectedTransport(page, layer, root, camera, geometry, {
          x: -640,
          y: -480,
          width: 1920,
          height: 1440,
        });
        const cropped = projectedTransport(page, layer, root, camera, geometry, {
          x: 250,
          y: 120,
          width: 90,
          height: 100,
        });
        expect(cropped).not.toEqual(full);
        for (const [u, v] of [
          [0, 0],
          [47, 31],
          [120, 60],
          [240, 120],
        ]) {
          const point = new Vector3(
            ((u! - layer.width / 2) * 2) / Math.min(layer.width, layer.height),
            ((layer.height / 2 - v!) * 2) / Math.min(layer.width, layer.height),
            front,
          )
            .applyMatrix4(content.matrixWorld)
            .project(camera);
          const local = transformPoint(invertMatrix(geometry.layoutMatrix(layer.id)), {
            x: ((point.x + 1) * page.width) / 2,
            y: ((1 - point.y) * page.height) / 2,
          });
          projected.push(local.x);
          for (const bounds of [full, cropped]) {
            const uv = {
              x: (local.x - bounds.x) / bounds.width,
              y: (local.y - bounds.y) / bounds.height,
            };
            const authored = new Vector3(
              bounds.x + uv.x * bounds.width,
              bounds.y + uv.y * bounds.height,
              1,
            ).applyMatrix3(mapping);
            expect(authored.x / authored.z).toBeCloseTo(u!, 8);
            expect(authored.y / authored.z).toBeCloseTo(v!, 8);
          }
        }
        expect(spatialEffectProjection(page, layer, content, camera, geometry)).toEqual(matrix);
      }
      expect(projected[0]).not.toBeCloseTo(projected[4]!, 2);
    } finally {
      native.dispose();
      material.dispose();
    }
  },
);

test("unsupported, empty, edge-on and behind-camera faces have no effect projection", () => {
  const layer = createLayer("text", {
    id: "text",
    text: "AV",
    width: 200,
    height: 100,
    spatial: createSpatialLayer("shape"),
  });
  const settings = createSpatialScene();
  settings.camera = { ...settings.camera, projection: "orthographic", yaw: 0, pitch: 0 };
  const page = createPage({ width: 200, height: 100, layers: [layer], spatial: settings });
  const camera = createSpatialCamera(settings.camera, 2);
  updateCompositionCamera(camera, page, WebGPUCoordinateSystem);
  const material = new MeshBasicMaterial();
  const native = buildSpatialGeometry(spatialGeometryJob(layer, outlineFont()));
  const content = new Mesh(native, material);
  content.updateMatrix();
  const geometry = new SpatialGeometry(page);
  try {
    expect(spatialEffectProjection(page, layer, content, camera, geometry)).toBeDefined();
    expect(spatialEffectProjection(page, layer, new Group(), camera, geometry)).toBeUndefined();
    expect(
      spatialEffectProjection(page, { ...layer, kind: "rectangle" }, content, camera, geometry),
    ).toBeUndefined();
    const empty = new BufferGeometry();
    content.geometry = empty;
    expect(spatialEffectProjection(page, layer, content, camera, geometry)).toBeUndefined();
    empty.dispose();
    content.geometry = native;
    for (const pose of [{ rotationY: 90 }, { z: settings.camera.distance + 1 }]) {
      const next = { ...layer, spatial: { ...layer.spatial!, ...pose } };
      const moved = { ...page, layers: [next] };
      expect(
        spatialEffectProjection(moved, next, content, camera, new SpatialGeometry(moved)),
      ).toBeUndefined();
    }
    camera.projectionMatrix = new Matrix4().set(0, 0, 0, NaN, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1);
    expect(spatialEffectProjection(page, layer, content, camera, geometry)).toBeUndefined();
  } finally {
    native.dispose();
    material.dispose();
  }
});

test("visible extrusion sides crossing the face horizon retain raster-space effects", () => {
  const settings = createSpatialScene();
  settings.camera.yaw = 83;
  settings.camera.pitch = 0;
  const source = createLayer("vector", {
    id: "shape",
    x: 150,
    y: 150,
    width: 300,
    height: 300,
    spatial: {
      ...createSpatialLayer("extrude"),
      x: 0.28,
      y: 0.89,
      z: 0.3,
      scaleX: 1.8,
      scaleY: 1.8,
      scaleZ: 1.8,
      rotationY: -7,
    },
  });
  const native = new BoxGeometry(2, 2, 0.38);
  const material = new MeshBasicMaterial();
  const content = new Mesh(native, material);
  const root = new Group();
  root.matrixAutoUpdate = false;
  root.add(content);
  try {
    for (const rotationY of [-10, -7, 0, 87, 90]) {
      const layer = { ...source, spatial: { ...source.spatial!, rotationY } };
      const page = createPage({ width: 600, height: 600, spatial: settings, layers: [layer] });
      const geometry = new SpatialGeometry(page);
      root.matrix.fromArray(geometry.worldMatrix(layer.id));
      root.updateMatrixWorld(true);
      const camera = createSpatialCamera(settings.camera, 1);
      updateCompositionCamera(camera, page, WebGPUCoordinateSystem);
      const transport = projectedTransport(page, layer, root, camera, geometry);
      expect(transport.width * transport.height).toBeGreaterThan(10000);
      const projection = spatialEffectProjection(page, layer, content, camera, geometry);
      expect(projection).toBeDefined();
      const result = spatialEffectProjection(page, layer, content, camera, geometry, transport);
      if (rotationY < 0) expect(result).toBeUndefined();
      else expect(result).toEqual(projection);
    }
  } finally {
    native.dispose();
    material.dispose();
  }
});
