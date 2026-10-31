import { expect, test, vi } from "vitest";
import { createEffect, createLayer, createSpatialLayer } from "@musart/core";
import {
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
  DataUtils,
  BoxGeometry,
  Texture,
  Group,
} from "three";
import { buildSpatialGeometry } from "../../src/spatial/geometry-build";
import { spatialGeometryJob, spatialGeometryKey } from "../../src/spatial/outlines";
import { spatialMorphPaths } from "../../src/spatial/morph";
import { disposeModel, disposeModels, inspectGlb } from "../../src/spatial/glb";
import {
  resizeEnvironmentPixels,
  decodeEnvironmentPixels,
} from "../../src/spatial/environment-decode";
import { outlineFont } from "../text-fixture";
import { morphFixture } from "../morph-fixture";
import { spatialGlb } from "../../../../test/browser/support/spatial-glb";
test("editable SVG extrusion retains holes, viewBox coordinates and real depth", () => {
  const layer = createLayer("vector", {
    width: 100,
    height: 100,
    spatial: { ...createSpatialLayer("extrude"), bevel: 0, depth: 0.4 },
    vector: {
      viewBox: "10 20 100 100",
      parts: [{ path: "M10 20H110V120H10Z M35 45H85V95H35Z", fillRule: "evenodd" }],
    },
  });
  const geometry = buildSpatialGeometry(spatialGeometryJob(layer));
  const material = new MeshBasicMaterial({ side: DoubleSide }),
    mesh = new Mesh(geometry, material);
  try {
    geometry.computeBoundingBox();
    mesh.updateMatrixWorld(true);
    expect(geometry.boundingBox!.min.z).toBeCloseTo(-0.2);
    expect(geometry.boundingBox!.max.z).toBeCloseTo(0.2);
    expect(
      new Raycaster(new Vector3(0, 0, 10), new Vector3(0, 0, -1)).intersectObject(mesh),
    ).toHaveLength(0);
    expect(
      new Raycaster(new Vector3(0.8, 0.8, 10), new Vector3(0, 0, -1)).intersectObject(mesh).length,
    ).toBeGreaterThan(0);
  } finally {
    geometry.dispose();
    material.dispose();
  }
});
test("3D text uses shaped font outlines and material/pose changes retain geometry identity", () => {
  const layer = createLayer("text", {
    text: "AV",
    fontSize: 60,
    width: 200,
    height: 100,
    spatial: createSpatialLayer("extrude"),
  });
  const font = outlineFont(),
    job = spatialGeometryJob(layer, font),
    key = spatialGeometryKey(layer);
  expect(job.paths).toHaveLength(2);
  expect(
    spatialGeometryKey({
      ...layer,
      fill: "#ff0000",
      spatial: { ...layer.spatial!, rotationY: 45 },
    }),
  ).toBe(key);
  expect(spatialGeometryKey({ ...layer, fontFamily: "Another font" })).not.toBe(key);
  expect(spatialGeometryKey({ ...layer, text: "B" })).not.toBe(key);
  expect(spatialGeometryJob({ ...layer, text: "B" }, font).paths).toHaveLength(1);
  const geometry = buildSpatialGeometry(job);
  expect(geometry.getAttribute("position").count).toBeGreaterThan(100);
  geometry.dispose();
  const effect = createEffect("morph", { shapeMorph: { ...morphFixture(), sourceText: "AV" } });
  const typed = spatialGeometryJob({ ...layer, effects: [effect] }, font);
  expect(typed.morph?.definition?.shapes).toHaveLength(1);
});
test("worker morph sampling changes geometry deterministically and rejects unbounded work before triangulation", () => {
  const definition = morphFixture();
  definition.shapes[0]!.frames[1]!.box = [0.2, 0, 0.5, 1];
  const morph = {
    key: "worker-regression",
    definition,
    progress: 0,
    stagger: 0.5,
    order: "forward",
    amount: 1,
    width: 100,
    height: 100,
  };
  const job = {
    source: "extrude" as const,
    depth: 0.3,
    bevel: 0,
    bevelSegments: 3,
    curveSegments: 12,
    morph,
  };
  const start = spatialMorphPaths(job),
    end = spatialMorphPaths({ ...job, morph: { ...morph, progress: 1 } });
  expect(end).not.toEqual(start);
  expect(
    spatialMorphPaths({ ...job, morph: { ...morph, definition: undefined, progress: 1 } }),
  ).toEqual(end);
  expect(() =>
    buildSpatialGeometry({
      ...job,
      morph: undefined,
      paths: [Array.from({ length: 10000 }, () => ({ type: "L" as const, x: 0, y: 0 }))],
    }),
  ).toThrow("geometry budget");
});
test("GLB inspection rejects malformed/external inputs and disposes shared model resources once", () => {
  expect(inspectGlb(spatialGlb()).nodes).toHaveLength(1);
  const broken = spatialGlb();
  new DataView(broken).setUint32(8, 1, true);
  expect(() => inspectGlb(broken)).toThrow("header");
  const json = new TextEncoder().encode(
    JSON.stringify({ buffers: [{ uri: "https://example.com/model.bin" }] }),
  );
  const padded = Math.ceil(json.length / 4) * 4,
    external = new ArrayBuffer(20 + padded),
    view = new DataView(external);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, external.byteLength, true);
  view.setUint32(12, padded, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(external, 20).fill(32);
  new Uint8Array(external, 20, json.length).set(json);
  expect(() => inspectGlb(external)).toThrow("embed");
  const root = new Group(),
    geometry = new BoxGeometry(),
    texture = new Texture(),
    material = new MeshBasicMaterial({ map: texture });
  const close = vi.fn();
  texture.image = { width: 1, height: 1, close };
  const releasedGeometry = vi.spyOn(geometry, "dispose"),
    releasedMaterial = vi.spyOn(material, "dispose"),
    releasedTexture = vi.spyOn(texture, "dispose");
  root.add(new Mesh(geometry, material), new Mesh(geometry, material));
  disposeModel(root);
  expect(root.children).toHaveLength(0);
  expect(releasedGeometry).toHaveBeenCalledOnce();
  expect(releasedMaterial).toHaveBeenCalledOnce();
  expect(releasedTexture).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});
test("HDR filtering preserves linear values above one and rejects giant headers before decoding", async () => {
  const data = new Uint16Array(2048 * 1024 * 4);
  data.fill(DataUtils.toHalfFloat(4));
  const resized = resizeEnvironmentPixels(data, 2048, 1024);
  expect(resized).toMatchObject({
    width: 1024,
    height: 512,
    originalWidth: 2048,
    originalHeight: 1024,
    half: true,
  });
  expect(DataUtils.fromHalfFloat(new Uint16Array(resized.data)[0]!)).toBe(4);
  const header = new TextEncoder().encode(
    "#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 100000 +X 200000\n",
  ).buffer;
  await expect(decodeEnvironmentPixels(header, "image/vnd.radiance")).rejects.toThrow("4096");
});

test("unused GLB scenes release unique resources without closing resources retained by the visible scene", () => {
  const active = new Group(),
    unused = new Group(),
    geometry = new BoxGeometry(),
    texture = new Texture(),
    material = new MeshBasicMaterial({ map: texture });
  const close = vi.fn();
  texture.image = { width: 1, height: 1, close };
  active.add(new Mesh(geometry, material));
  unused.add(new Mesh(geometry, material));
  const released = vi.spyOn(geometry, "dispose");
  disposeModels([unused], active);
  expect(unused.children).toHaveLength(0);
  expect(released).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  disposeModel(active);
  expect(released).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});
