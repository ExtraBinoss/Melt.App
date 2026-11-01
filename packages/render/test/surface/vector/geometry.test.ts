import { expect, it, vi } from "vitest";
import { createLayer } from "@musart/core";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { BufferGeometry } from "three/webgpu";
import {
  hasFill,
  hasStroke,
  parseVectorGeometry,
  strokeWidth,
  vectorGeometryKey,
  vectorParts,
} from "../../../src/surface/vector/geometry";
const layer = () =>
  createLayer("vector", {
    width: 24,
    height: 24,
    vector: {
      viewBox: "10 20 24 24",
      parts: [{ path: "M10 20h10v10h-10z", matrix: [1, 0, 0, 1, 2, 3], fillRule: "evenodd" }],
    },
  });
it("triangulates viewBox paths once and keeps paint values outside geometry identity", () => {
  const l = layer(),
    key = vectorGeometryKey(l),
    parts = parseVectorGeometry(l);
  expect(parts).toHaveLength(1);
  parts[0]!.geometry.computeBoundingBox();
  expect(parts[0]!.geometry.boundingBox!.min.x).toBe(12);
  expect(parts[0]!.geometry.boundingBox!.min.y).toBe(23);
  expect(parts[0]!.partIndex).toBe(0);
  expect(
    vectorGeometryKey({
      ...l,
      fill: "#ff0000",
      vector: { ...l.vector!, parts: [{ ...l.vector!.parts![0]!, fill: "#00ff00", opacity: 0.5 }] },
    }),
  ).toBe(key);
  parts.forEach((p) => p.geometry.dispose());
  expect(vectorParts({ viewBox: "0 0 1 1" })).toEqual([{ path: "" }]);
  expect(() => vectorGeometryKey({ ...l, vector: undefined })).toThrow("absente");
  expect(() => parseVectorGeometry({ ...l, vector: undefined })).toThrow("absente");
});
it("handles stroke-only paths, widths, explicit none and empty paths", () => {
  const l = layer();
  l.vector!.strokeOnly = true;
  l.vector!.parts = [
    {
      path: "M10 20L20 30",
      stroke: "#123456",
      strokeWidth: 3,
      linecap: "square",
      linejoin: "bevel",
    },
  ];
  expect(hasFill(l, l.vector!.parts[0]!)).toBe(false);
  expect(hasStroke(l, l.vector!.parts[0]!)).toBe(true);
  expect(strokeWidth(l, l.vector!.parts[0]!)).toBe(3);
  l.vector!.preserveColors = true;
  expect(strokeWidth(l, {} as never)).toBe(1);
  l.strokeWidth = 4;
  expect(strokeWidth(l, {} as never)).toBe(4);
  l.vector!.preserveColors = false;
  expect(strokeWidth(l, l.vector!.parts[0]!)).toBe(4);
  const parts = parseVectorGeometry(l);
  expect(parts[0]!.kind).toBe("stroke");
  parts.forEach((p) => p.geometry.dispose());
  expect(hasStroke(l, { path: "", stroke: "none" })).toBe(false);
  l.vector!.parts = [{ path: "M0 0" }];
  expect(parseVectorGeometry(l)).toEqual([]);
});
it("disposes already-built geometry if later stroke preparation fails", () => {
  const l = layer();
  l.vector!.parts!.push({ path: "M0 0L10 10", fill: "none", stroke: "white" });
  const dispose = vi.spyOn(BufferGeometry.prototype, "dispose"),
    stroke = vi.spyOn(SVGLoader, "pointsToStroke").mockImplementationOnce(() => {
      throw new Error("stroke failed");
    });
  try {
    expect(() => parseVectorGeometry(l)).toThrow("stroke failed");
    expect(dispose).toHaveBeenCalledOnce();
  } finally {
    stroke.mockRestore();
    dispose.mockRestore();
  }
});
it("disposes completed batches when a later XML batch contains an invalid path", () => {
  const l = layer();
  l.vector!.parts!.push(...Array.from({ length: 255 }, () => ({ path: "" })), { path: "123" });
  const dispose = vi.spyOn(BufferGeometry.prototype, "dispose");
  try {
    expect(() => parseVectorGeometry(l)).toThrow();
    expect(dispose).toHaveBeenCalledOnce();
  } finally {
    dispose.mockRestore();
  }
});
