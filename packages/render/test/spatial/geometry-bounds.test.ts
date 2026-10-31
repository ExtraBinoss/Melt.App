import { expect, test } from "vitest";
import { SPATIAL_GEOMETRY_DEFINITIONS } from "@musart/core";
import { spatialPrimitiveGeometry } from "../../src/spatial/primitives";

test("every native primitive stays inside its shared intrinsic bound contract", () => {
  for (const source of Object.keys(
    SPATIAL_GEOMETRY_DEFINITIONS,
  ) as (keyof typeof SPATIAL_GEOMETRY_DEFINITIONS)[]) {
    const geometry = spatialPrimitiveGeometry({
      source,
      depth: 0.4,
      bevel: 0,
      bevelSegments: 3,
      curveSegments: 12,
    })!;
    try {
      const bounds = SPATIAL_GEOMETRY_DEFINITIONS[source].bounds;
      const position = geometry.getAttribute("position");
      for (let i = 0; i < position.count; i++) {
        const point = [position.getX(i), position.getY(i), position.getZ(i)];
        let radius = 0;
        for (let axis = 0; axis < 3; axis++) {
          const extent = bounds.halfSize[axis]!;
          expect(Math.abs(point[axis]! - bounds.center[axis]!), source).toBeLessThanOrEqual(
            extent + 1e-6,
          );
          if (extent) radius += ((point[axis]! - bounds.center[axis]!) / extent) ** 2;
        }
        if (bounds.kind === "ellipsoid") expect(radius, source).toBeLessThanOrEqual(1 + 1e-6);
      }
    } finally {
      geometry.dispose();
    }
  }
});
