import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import * as api from "text-shaper";
import { Mesh, MeshBasicMaterial, DoubleSide, Raycaster, Vector3 } from "three";
import { createOutlineFont } from "../../src/surface/text/outlines";
import { weightedGlyph } from "../../src/surface/text/fonts";
import { buildSpatialGeometry } from "../../src/spatial/geometry-build";
import type { SpatialGeometryJob } from "../../src/spatial/geometry-model";
function hit(job: SpatialGeometryJob, x: number, y: number) {
  const geometry = buildSpatialGeometry(job),
    material = new MeshBasicMaterial({ side: DoubleSide });
  try {
    return (
      new Raycaster(new Vector3(x, y, 2), new Vector3(0, 0, -1)).intersectObject(
        new Mesh(geometry, material),
      ).length > 0
    );
  } finally {
    geometry.dispose();
    material.dispose();
  }
}
test("the real variable Inter M keeps its upper notch after extrusion and beveling", () => {
  const data = readFileSync("apps/web/public/fonts/inter/font.ttf");
  const owner = createOutlineFont(api.Font.load(new Uint8Array(data).buffer), api);
  try {
    const commands = weightedGlyph(owner.font, owner.font.charToGlyph("M"), 800).getPath(
      0,
      1,
      1,
    ).commands;
    const job: SpatialGeometryJob = {
      source: "extrude",
      depth: 0.12,
      bevel: 0.005,
      bevelSegments: 3,
      curveSegments: 16,
      paths: [commands],
    };
    expect(hit(job, 0.47, 0.38)).toBe(false);
    expect(hit(job, 0.1, 0.38)).toBe(true);
    expect(hit(job, 0.8, 0.38)).toBe(true);
  } finally {
    owner.dispose();
  }
});
test("SVG nonzero overlaps and even-odd holes use their authored fill rule", () => {
  const paths: SpatialGeometryJob["paths"] = [
    [
      { type: "M", x: 0, y: 0 },
      { type: "L", x: 1, y: 0 },
      { type: "L", x: 1, y: 1 },
      { type: "L", x: 0, y: 1 },
      { type: "Z" },
      { type: "M", x: 0.25, y: 0.25 },
      { type: "L", x: 0.75, y: 0.25 },
      { type: "L", x: 0.75, y: 0.75 },
      { type: "L", x: 0.25, y: 0.75 },
      { type: "Z" },
    ],
  ];
  const job: SpatialGeometryJob = {
    source: "extrude",
    depth: 0.1,
    bevel: 0,
    bevelSegments: 1,
    curveSegments: 8,
    paths,
  };
  expect(hit({ ...job, pathFillRules: ["nonzero"] }, 0.5, 0.5)).toBe(true);
  expect(hit({ ...job, pathFillRules: ["evenodd"] }, 0.5, 0.5)).toBe(false);
  expect(hit({ ...job, pathFillRules: ["evenodd"] }, 0.1, 0.1)).toBe(true);
});
