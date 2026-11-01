import { expect, it, vi } from "vitest";
import { createLayer } from "@musart/core";
import type { VectorPart } from "@musart/core";
import { Matrix4, ShapeGeometry } from "three/webgpu";
import type { BufferGeometry } from "three/webgpu";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { parseVectorPaths } from "../../../src/surface/vector/paths";
import { parseVectorGeometry } from "../../../src/surface/vector/geometry";

const ring = "M0 0H40V40H0Z M10 10H30V30H10Z";
const parts: VectorPart[] = [
  { path: "" },
  { path: ring, fillRule: "evenodd", matrix: [-1, 0.2, 0.3, 1, 45, 2] },
  { path: "none" },
  { path: ring, fillRule: "nonzero" },
  {
    path: "M2 4C5 30 25 -8 32 9S40 20 35 30Q20 35 8 28T2 4Z M50 10a8 4 30 1 0 16 3",
    stroke: "white",
    strokeWidth: 2,
    linecap: "square",
    linejoin: "bevel",
  },
  { path: "M4 2L18 2L8 19", fill: "none", stroke: "white", linecap: "butt", linejoin: "miter" },
  {
    path: "M50 12L68 18L54 30Z",
    fill: "none",
    stroke: "white",
    linecap: "round",
    linejoin: "round",
  },
];
function snapshot(geometry: BufferGeometry) {
  return {
    index: geometry.index ? Array.from(geometry.index.array) : null,
    attributes: Object.fromEntries(
      Object.entries(geometry.attributes).map(([name, attribute]) => [
        name,
        Array.from(attribute.array),
      ]),
    ),
  };
}

it("parses multipart sources in one XML document with stable IDs across omitted empty paths", () => {
  const parse = vi.spyOn(DOMParser.prototype, "parseFromString");
  try {
    const paths = Array.from(parseVectorPaths({ viewBox: "0 0 80 40", parts }));
    expect(parse).toHaveBeenCalledOnce();
    expect(paths.map((item) => item.partIndex)).toEqual([1, 3, 4, 5, 6]);
    expect(paths[0]!.path.toShapes()[0]!.holes).toHaveLength(1);
    expect(paths[1]!.path.toShapes()[0]!.holes).toHaveLength(0);
    expect(Array.from(parseVectorPaths({ viewBox: "0 0 1 1", parts: [] }))).toEqual([]);
    expect(parse).toHaveBeenCalledOnce();
  } finally {
    parse.mockRestore();
  }
});

it("retains exact Three fill/stroke buffers, matrices, detail and ordering from separate SVG parses", () => {
  const layer = createLayer("vector", { vector: { viewBox: "0 0 80 40", parts } });
  const actual = parseVectorGeometry(layer),
    expected: { geometry: BufferGeometry; kind: string; partIndex: number }[] = [];
  try {
    for (const [partIndex, part] of parts.entries()) {
      const parsed = new SVGLoader().parse(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40"><path d="${part.path}" fill-rule="${part.fillRule ?? "nonzero"}"/></svg>`,
      );
      for (const path of parsed.paths) {
        const shapes = path.toShapes();
        if (part.fill !== "none" && shapes.length)
          expected.push({ geometry: new ShapeGeometry(shapes, 24), kind: "fill", partIndex });
        if (part.stroke) {
          const style = SVGLoader.getStrokeStyle(
            part.strokeWidth ?? 2,
            "#ffffff",
            part.linejoin ?? "round",
            part.linecap ?? "round",
          );
          for (const subpath of path.subPaths) {
            const geometry = SVGLoader.pointsToStroke(subpath.getPoints(48), style, 12, 0.0001);
            if (geometry) expected.push({ geometry, kind: "stroke", partIndex });
          }
        }
      }
    }
    for (const item of expected) {
      const matrix = parts[item.partIndex]!.matrix;
      if (matrix) {
        const [a, b, c, d, e, f] = matrix;
        item.geometry.applyMatrix4(
          new Matrix4().set(a, c, 0, e, b, d, 0, f, 0, 0, 1, 0, 0, 0, 0, 1),
        );
      }
    }
    expect(actual.map(({ kind, partIndex }) => [kind, partIndex])).toEqual(
      expected.map(({ kind, partIndex }) => [kind, partIndex]),
    );
    expect(actual.map((item) => snapshot(item.geometry))).toEqual(
      expected.map((item) => snapshot(item.geometry)),
    );
  } finally {
    for (const item of [...actual, ...expected]) item.geometry.dispose();
  }
});

it("keeps XML-like imported path data inert and propagates parser failures", () => {
  const xmlLike = 'M0 0L10 10"/><path d="M50 50L60 60';
  const native = DOMParser.prototype.parseFromString;
  let document: Document | undefined;
  const xml = vi.spyOn(DOMParser.prototype, "parseFromString").mockImplementation(function (
    this: DOMParser,
    input,
    type,
  ) {
    document = native.call(this, input, type);
    return document;
  });
  try {
    expect(() =>
      Array.from(parseVectorPaths({ viewBox: "0 0 80 40", parts: [{ path: xmlLike }] })),
    ).toThrow();
    expect(document!.querySelectorAll("path")).toHaveLength(1);
    expect(document!.querySelector("path")!.getAttribute("d")).toBe(xmlLike);
  } finally {
    xml.mockRestore();
  }
  const parse = vi.spyOn(SVGLoader.prototype, "parse").mockImplementationOnce(() => {
    throw new Error("invalid source");
  });
  try {
    expect(() => Array.from(parseVectorPaths({ viewBox: "0 0 1 1", path: "M0 0" }))).toThrow(
      "invalid source",
    );
  } finally {
    parse.mockRestore();
  }
});

it("bounds XML batches by part count and path characters without truncating large paths", () => {
  const parse = vi.spyOn(DOMParser.prototype, "parseFromString");
  try {
    const many = Array.from(
      parseVectorPaths({
        viewBox: "0 0 1 1",
        parts: Array.from({ length: 257 }, () => ({ path: "M0 0L1 1" })),
      }),
    );
    expect(parse).toHaveBeenCalledTimes(2);
    expect(many.map((item) => item.partIndex)).toEqual(Array.from({ length: 257 }, (_, i) => i));
    parse.mockClear();
    const oversized = `M0 0${" ".repeat(256 * 1024)}L1 1`;
    const large = Array.from(
      parseVectorPaths({
        viewBox: "0 0 1 1",
        parts: [{ path: "M0 0" }, { path: oversized }, { path: "M0 0" }],
      }),
    );
    expect(parse).toHaveBeenCalledTimes(3);
    expect(large.map((item) => item.partIndex)).toEqual([0, 1, 2]);
    expect((large[1]!.path.userData.node as Element).getAttribute("d")).toBe(oversized);
  } finally {
    parse.mockRestore();
  }
});
