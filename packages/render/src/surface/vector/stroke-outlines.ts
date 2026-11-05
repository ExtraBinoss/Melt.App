import ClipperLib from "clipper-lib";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import type { VectorDefinition, VectorPart } from "@musart/core";

// Integer source coordinates bound offset work and retain subpixel SVG detail.
const PRECISION = 10_000;
const MAX_PARTS = 256;
const MAX_CHARACTERS = 256 * 1024;
const MAX_CURVES = 1024;
const MAX_POINTS = 8192;
type Budget = { characters: number; curves: number; points: number };
type VectorOutlineErrorCode = "partLimit" | "outlineLimit" | "outlineFailed";
export class VectorOutlineError extends Error {
  constructor(readonly code: VectorOutlineErrorCode) {
    super(`Vector stroke outline preparation failed: ${code}`);
    this.name = "VectorOutlineError";
  }
}
function fail(code: VectorOutlineErrorCode): never {
  throw new VectorOutlineError(code);
}
function escapePath(path: string) {
  return path.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
function strokePaths(part: VectorPart, width: number, budget: Budget): string {
  budget.characters += part.path.length;
  if (budget.characters > MAX_CHARACTERS || !Number.isFinite(width)) fail("outlineLimit");
  const parsed = new SVGLoader().parse(
    `<svg xmlns="http://www.w3.org/2000/svg"><path d="${escapePath(part.path)}"/></svg>`,
  );
  const radius = (width * PRECISION) / 2;
  // Twelve samples per semicircle preserve the native round-cap silhouette.
  const offset = new ClipperLib.ClipperOffset(
    4,
    Math.max(1, radius * (1 - Math.cos(Math.PI / 24))),
  );
  const tree = new ClipperLib.PolyTree();
  const join =
    part.linejoin === "miter"
      ? ClipperLib.JoinType.jtMiter
      : part.linejoin === "bevel"
        ? ClipperLib.JoinType.jtSquare
        : ClipperLib.JoinType.jtRound;
  const cap =
    part.linecap === "butt"
      ? ClipperLib.EndType.etOpenButt
      : part.linecap === "square"
        ? ClipperLib.EndType.etOpenSquare
        : ClipperLib.EndType.etOpenRound;
  try {
    for (const path of parsed.paths)
      for (const subpath of path.subPaths) {
        budget.curves += subpath.curves.length;
        if (budget.curves > MAX_CURVES) fail("outlineLimit");
        const points = subpath.getPoints(48);
        budget.points += points.length;
        if (budget.points > MAX_POINTS) fail("outlineLimit");
        if (points.length < 2) continue;
        const centerline = points.map(({ x, y }) => {
          if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            Math.abs(x) > 1_000_000 ||
            Math.abs(y) > 1_000_000
          )
            fail("outlineLimit");
          return { X: Math.round(x * PRECISION), Y: Math.round(y * PRECISION) };
        });
        const closed = subpath.autoClose || points[0]!.distanceToSquared(points.at(-1)!) < 1e-8;
        offset.AddPath(centerline, join, closed ? ClipperLib.EndType.etClosedLine : cap);
      }
    offset.Execute(tree, radius);
    const contours = ClipperLib.Clipper.PolyTreeToPaths(tree);
    if (contours.reduce((count, path) => count + path.length + 1, 0) > 4096) fail("outlineLimit");
    return contours
      .filter((path) => path.length >= 3)
      .map(
        (path) =>
          path
            .map(({ X, Y }, index) => {
              if (Math.abs(X / PRECISION) > 1_000_000 || Math.abs(Y / PRECISION) > 1_000_000)
                fail("outlineLimit");
              return `${index ? "L" : "M"}${X / PRECISION} ${Y / PRECISION}`;
            })
            .join("") + "Z",
      )
      .join("");
  } finally {
    offset.Clear();
    tree.Clear();
  }
}

/** Native extrusion consumes portable filled contours, including actual SVG stroke caps and joins. */
export function prepareVectorStrokeOutlines(
  vector: VectorDefinition,
  currentColor: string,
): VectorDefinition {
  const originals: VectorPart[] = vector.parts ?? [{ path: vector.path ?? "" }];
  const hasStroke = (part: VectorPart) =>
    part.stroke !== "none" && (!!vector.strokeOnly || !!part.stroke);
  const hasFill = (part: VectorPart) => !vector.strokeOnly && part.fill !== "none";
  const count = originals.reduce(
    (total, part) => total + Number(hasFill(part)) + Number(hasStroke(part)),
    0,
  );
  if (originals.length > MAX_PARTS || count > MAX_PARTS) fail("partLimit");
  if (!originals.some(hasStroke)) return vector;
  const budget: Budget = { characters: 0, curves: 0, points: 0 };
  const parts: VectorPart[] = [];
  const paint = (value: string | undefined, fallback: string) =>
    value === "currentColor" ? currentColor : (value ?? fallback);
  for (const part of originals) {
    if (hasFill(part))
      parts.push({
        ...part,
        stroke: "none",
        fill: vector.preserveColors ? paint(part.fill, "#000000") : part.fill,
      });
    if (!hasStroke(part)) continue;
    const width = part.strokeWidth ?? (vector.preserveColors ? 1 : 2);
    if (width <= 0) continue;
    const path = strokePaths(part, width, budget);
    if (!path) continue;
    parts.push({
      path,
      fill: paint(part.stroke, currentColor),
      fillRule: "nonzero",
      matrix: part.matrix,
      opacity: part.opacity,
    });
  }
  if (!parts.length) fail("outlineFailed");
  return {
    viewBox: vector.viewBox,
    parts,
    strokeOnly: false,
    preserveColors: vector.preserveColors,
    attribution: vector.attribution,
  };
}
