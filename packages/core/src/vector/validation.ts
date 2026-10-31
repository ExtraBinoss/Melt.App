import { editVectorPath } from "./edit/path";
import { writeRoundedVectorPath } from "./edit/rounding";
import { canRoundVectorNode } from "./edit/nodes";
import type { VectorCorner } from "./model";
import { ensure } from "../errors";
import {
  assertRecord,
  assertText,
  assertNumber,
  assertBoolean,
  assertColor,
  assertList,
} from "../document/guards";
const pathPattern = /^[MmZzLlHhVvCcSsQqTtAa\dEe+.,\s-]+$/;
function path(value: unknown): asserts value is string {
  assertText(value, 2_000_000);
  ensure(
    /^[Mm]/.test(value.trim()) && pathPattern.test(value),
    "INVALID_DOCUMENT",
    "Invalid vector path",
  );
}
function paint(value: unknown): void {
  if (value !== "none" && value !== "currentColor") assertColor(value);
}
export function validateVector(value: unknown): void {
  assertRecord(value);
  assertText(value.viewBox, 256);
  const box = value.viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  ensure(
    box.length === 4 && box.every(Number.isFinite) && box[2]! > 0 && box[3]! > 0,
    "INVALID_DOCUMENT",
    "Invalid vector viewBox",
  );
  ensure(
    typeof value.path === "string" || Array.isArray(value.parts),
    "INVALID_DOCUMENT",
    "Vector geometry is missing",
  );
  if (value.path !== undefined) path(value.path);
  if (value.parts !== undefined) {
    assertList(value.parts, 10000);
    ensure(value.parts.length > 0, "INVALID_DOCUMENT", "Empty vector parts");
    for (const part of value.parts) {
      assertRecord(part);
      path(part.path);
      if (part.nodeEditing !== undefined) {
        const editing = part.nodeEditing;
        assertRecord(editing);
        ensure(
          editing.version === 1 && part.matrix === undefined,
          "INVALID_DOCUMENT",
          "Invalid SVG node parameters",
        );
        path(editing.path);
        assertList(editing.rounding, 4096);
        const paths = editVectorPath({ path: editing.path }),
          rounding: VectorCorner[] = [],
          seen = new Set<string>();
        for (const corner of editing.rounding) {
          assertRecord(corner);
          assertNumber(corner.contour, 0, 4095);
          assertNumber(corner.node, 0, 4095);
          assertNumber(corner.radius, 0, 1000000);
          const key = `${corner.contour}:${corner.node}`,
            subpath = paths[corner.contour];
          ensure(
            Number.isInteger(corner.contour) &&
              Number.isInteger(corner.node) &&
              !!subpath?.nodes[corner.node] &&
              !seen.has(key) &&
              canRoundVectorNode(subpath, corner.node),
            "INVALID_DOCUMENT",
            "Invalid SVG corner parameters",
          );
          seen.add(key);
          rounding.push({ contour: corner.contour, node: corner.node, radius: corner.radius });
        }
        ensure(
          writeRoundedVectorPath(paths, rounding) === part.path,
          "INVALID_DOCUMENT",
          "SVG outline does not match its node parameters",
        );
      }
      if (part.fill !== undefined) paint(part.fill);
      if (part.stroke !== undefined) paint(part.stroke);
      if (part.strokeWidth !== undefined) assertNumber(part.strokeWidth, 0, 32768);
      if (part.opacity !== undefined) assertNumber(part.opacity, 0, 1);
      for (const [key, allowed] of [
        ["fillRule", ["nonzero", "evenodd"]],
        ["linecap", ["butt", "round", "square"]],
        ["linejoin", ["miter", "round", "bevel"]],
      ] as const)
        if (part[key] !== undefined)
          ensure(
            (allowed as readonly unknown[]).includes(part[key]),
            "INVALID_DOCUMENT",
            "Invalid vector stroke or fill style",
          );
      if (part.matrix !== undefined) {
        assertList(part.matrix, 6);
        ensure(part.matrix.length === 6, "INVALID_DOCUMENT", "Invalid vector matrix");
        for (const number of part.matrix) assertNumber(number, -1_000_000, 1_000_000);
      }
    }
  }
  if (value.strokeOnly !== undefined) assertBoolean(value.strokeOnly);
  if (value.preserveColors !== undefined) assertBoolean(value.preserveColors);
  if (value.attribution !== undefined) assertText(value.attribution, 10000);
}
