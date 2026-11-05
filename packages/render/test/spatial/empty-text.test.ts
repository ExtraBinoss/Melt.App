import { expect, test } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createSpatialLayer,
  createSpatialScene,
  SpatialGeometry,
} from "@musart/core";
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { buildSpatialGeometry, geometryPayload } from "../../src/spatial/geometry-build";
import { spatialGeometryJob, spatialGeometryKey } from "../../src/spatial/outlines";
import { outlineFont } from "../text-fixture";
import { morphFixture } from "../morph-fixture";
import {
  createSpatialCamera,
  updateCompositionCamera,
  updateSpatialObject,
} from "../../src/spatial/camera";
import { projectedTransport, transportProjection } from "../../src/spatial/scene/projection";

test.each(["", " ", "\t\n  ", "\u00a0"])(
  "native text deletion to %j prepares transparent geometry and can resume typing",
  (text) => {
    const font = outlineFont();
    const layer = createLayer("text", {
      text,
      width: 200,
      height: 100,
      fontSize: 60,
      spatial: createSpatialLayer("extrude"),
    });
    const job = spatialGeometryJob(layer, font);
    expect(job.emptyText).toBe(true);
    const geometry = buildSpatialGeometry(job);
    const material = new MeshBasicMaterial();
    const mesh = new Mesh(geometry, material);
    try {
      const scene = createSpatialScene();
      const page = createPage({ width: 200, height: 100, layers: [layer], spatial: scene });
      const spatialGeometry = new SpatialGeometry(page);
      const camera = createSpatialCamera(scene.camera, 2);
      updateCompositionCamera(camera, page, camera.coordinateSystem);
      updateSpatialObject(mesh, layer.spatial!);
      const emptyCrop = projectedTransport(page, layer, mesh, camera, spatialGeometry);
      expect(Object.values(emptyCrop).every(Number.isFinite)).toBe(true);
      expect(emptyCrop).toEqual({ x: 0, y: 0, width: 1, height: 1 });
      expect(
        transportProjection(page, layer, emptyCrop, spatialGeometry)
          .invert()
          .elements.every(Number.isFinite),
      ).toBe(true);
      expect(geometry.getAttribute("position").count).toBe(0);
      expect(geometry.getAttribute("normal").count).toBe(0);
      expect(geometry.getAttribute("uv").count).toBe(0);
      expect(
        geometryPayload(geometry).attributes.map((attribute) => attribute.buffer.byteLength),
      ).toEqual([0, 0, 0]);
      expect(
        new Raycaster(new Vector3(0, 0, 10), new Vector3(0, 0, -1)).intersectObject(mesh),
      ).toHaveLength(0);
      const resumed = { ...layer, text: "AV" };
      expect(spatialGeometryKey(resumed)).not.toBe(spatialGeometryKey(layer));
      const resumedGeometry = buildSpatialGeometry(spatialGeometryJob(resumed, font));
      expect(resumedGeometry.getAttribute("position").count).toBeGreaterThan(100);
      mesh.geometry = resumedGeometry;
      const resumedCrop = projectedTransport(page, resumed, mesh, camera, spatialGeometry);
      expect(Object.values(resumedCrop).every(Number.isFinite)).toBe(true);
      expect(
        transportProjection(page, resumed, resumedCrop, spatialGeometry)
          .invert()
          .elements.every(Number.isFinite),
      ).toBe(true);
      resumedGeometry.dispose();
    } finally {
      geometry.dispose();
      material.dispose();
    }
  },
);

test("empty native text bypasses obsolete Morph outlines while genuine outline failures remain errors", () => {
  const layer = createLayer("text", {
    text: "",
    spatial: createSpatialLayer("extrude"),
    effects: [createEffect("morph", { shapeMorph: { ...morphFixture(), sourceText: "AV" } })],
  });
  expect(spatialGeometryJob(layer, outlineFont())).toMatchObject({ emptyText: true });
  expect(() => spatialGeometryJob({ ...layer, text: " ".repeat(4097) }, outlineFont())).toThrow(
    "outline budget",
  );
  const vector = createLayer("vector", {
    spatial: createSpatialLayer("extrude"),
    vector: { viewBox: "0 0 100 100", parts: [{ path: "", fill: "none" }] },
  });
  expect(() => buildSpatialGeometry(spatialGeometryJob(vector))).toThrow(
    "needs visible filled outlines",
  );
  expect(() => spatialGeometryJob({ ...layer, text: "A", effects: [] })).toThrow(
    "outlines are unavailable",
  );
});
