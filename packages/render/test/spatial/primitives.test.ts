import { expect, test } from "vitest";
import { DoubleSide, PlaneGeometry } from "three";
import {
  SPATIAL_PRIMITIVES,
  createLayer,
  createSpatialLayer,
  createSpatialScene,
} from "@musart/core";
import { buildSpatialGeometry } from "../../src/spatial/geometry-build";
import { SpatialResource } from "../../src/spatial/SpatialResource";
test("all twenty native sources produce bounded finite mesh positions and normals", () => {
  for (const source of SPATIAL_PRIMITIVES) {
    const geometry = buildSpatialGeometry({
      source,
      depth: 0.2,
      bevel: 0.03,
      bevelSegments: 3,
      curveSegments: 12,
      paths: [
        [
          { type: "M", x: 0, y: 0 },
          { type: "L", x: 1, y: 0 },
          { type: "L", x: 1, y: 1 },
          { type: "L", x: 0, y: 1 },
          { type: "Z" },
        ],
      ],
    });
    try {
      const positions = geometry.getAttribute("position"),
        normals = geometry.getAttribute("normal");
      expect(positions.count, source).toBeGreaterThan(2);
      expect(positions.count).toBeLessThan(800000);
      expect([...positions.array, ...normals.array].every(Number.isFinite), source).toBe(true);
      if (geometry.index) expect(Math.max(...geometry.index.array)).toBeLessThan(positions.count);
      geometry.computeBoundingBox();
      expect(geometry.boundingBox!.isEmpty(), source).toBe(false);
      if (source === "shape") {
        expect(geometry.boundingBox!.min.z).toBe(0);
        expect(geometry.boundingBox!.max.z).toBe(0);
      }
    } finally {
      geometry.dispose();
    }
  }
});
test("planar sources remain visible from both sides while orbiting", () => {
  const scene = createSpatialScene(),
    layer = createLayer("rectangle", { spatial: createSpatialLayer("plane") });
  const resource = SpatialResource.primitive(new PlaneGeometry(1, 1), scene, layer);
  try {
    resource.update(layer, scene, null, 64, 64);
    expect(resource.material.side).toBe(DoubleSide);
  } finally {
    resource.dispose();
  }
});
