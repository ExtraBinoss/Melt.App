import { sourceMorph, morphResourceKey } from "../surface/morph/resource";
import { textMorph } from "../surface/morph/text";
import { resolveEffectSettings, type ShapeMorph } from "@musart/core";
const morphs = new Map<string, ShapeMorph>();
import type { Layer } from "@musart/core";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import type { SpatialGeometryJob, PathCommand } from "./geometry-model";
import { layoutText } from "../surface/text/layout";
import type { OutlineFont } from "../surface/text/fonts";
import { vectorParts } from "../surface/vector/geometry";
const vectorKeys = new WeakMap<object, string>();
const vectorShapes = new Map<string, string>();
let vectorSequence = 0,
  vectorKeyBytes = 0;
function vectorKey(vector: Layer["vector"]) {
  if (!vector) return "";
  const cached = Object.isFrozen(vector) ? vectorKeys.get(vector) : undefined;
  if (cached) return cached;
  const shape = JSON.stringify([
    vector.viewBox,
    vector.strokeOnly,
    vectorParts(vector).map((part) => [
      part.path,
      part.matrix,
      part.fillRule,
      part.fill === "none",
    ]),
  ]);
  let key = vectorShapes.get(shape);
  if (!key) {
    key = `vector:${++vectorSequence}`;
    if (shape.length <= 524288) {
      vectorShapes.set(shape, key);
      vectorKeyBytes += shape.length * 2;
      while (vectorShapes.size > 256 || vectorKeyBytes > 2 * 1024 * 1024) {
        const oldest = vectorShapes.keys().next().value!;
        vectorShapes.delete(oldest);
        vectorKeyBytes -= oldest.length * 2;
      }
    }
  }
  if (Object.isFrozen(vector)) vectorKeys.set(vector, key);
  return key;
}
export function spatialGeometryKey(layer: Layer): string {
  const s = layer.spatial!;
  const morph = s.source === "extrude" ? sourceMorph(layer) : undefined;
  return JSON.stringify([
    s.source,
    s.depth,
    s.bevel,
    s.bevelSegments,
    s.curveSegments,
    ...(s.source === "extrude"
      ? [
          layer.kind,
          layer.width,
          layer.height,
          layer.text,
          layer.fontFamily,
          layer.fontWeight,
          layer.fontSize,
          layer.lineHeight,
          layer.letterSpacing,
          layer.textAlign,
          vectorKey(layer.vector),
          layer.radius,
          ...(morph
            ? [
                morphResourceKey(layer, morph),
                resolveEffectSettings(morph),
                morph.amount,
                morph.opacity,
              ]
            : []),
        ]
      : []),
  ]);
}
export function spatialGeometryJob(layer: Layer, font?: OutlineFont): SpatialGeometryJob {
  const s = layer.spatial!;
  if (s.source === "glb") throw new Error("GLB geometry uses its original scene");
  const job: SpatialGeometryJob = {
    source: s.source,
    depth: s.depth,
    bevel: s.bevel,
    bevelSegments: s.bevelSegments,
    curveSegments: s.curveSegments,
  };
  if (s.source !== "extrude") return job;
  const effect = sourceMorph(layer);
  if (effect && (layer.kind === "text" || effect.shapeMorph)) {
    const key = morphResourceKey(layer, effect);
    let definition = morphs.get(key);
    if (!definition) {
      definition =
        layer.kind === "text" && font
          ? textMorph(layer, effect, font, layoutText(layer, font))
          : effect.shapeMorph;
      if (definition) morphs.set(key, definition);
    }
    if (definition) {
      morphs.delete(key);
      morphs.set(key, definition);
      if (morphs.size > 8) morphs.delete(morphs.keys().next().value!);
      const settings = resolveEffectSettings(effect);
      if (layer.kind === "vector")
        job.pathParts = definition.shapes.map((_, index) =>
          Math.min(index, (layer.vector?.parts?.length ?? 1) - 1),
        );
      job.morph = {
        key,
        definition,
        progress: Number(settings.progress),
        stagger: Number(settings.stagger),
        order: String(settings.order),
        amount: effect.amount * (effect.opacity ?? 1),
        width: layer.width,
        height: layer.height,
      };
      return job;
    }
  }
  const scale = 2 / Math.min(layer.width, layer.height);
  const transform = (
    commands: readonly PathCommand[],
    map: (x: number, y: number) => [number, number],
  ): PathCommand[] =>
    commands.map((c) => {
      if (c.type === "Z") return { type: "Z" };
      const [x, y] = map(c.x!, c.y!);
      return {
        ...c,
        x,
        y,
        ...(c.x1 === undefined
          ? {}
          : (() => {
              const [x1, y1] = map(c.x1!, c.y1!);
              return { x1, y1 };
            })()),
        ...(c.x2 === undefined
          ? {}
          : (() => {
              const [x2, y2] = map(c.x2!, c.y2!);
              return { x2, y2 };
            })()),
      };
    });
  const normalized = (x: number, y: number): [number, number] => [
    (x - layer.width / 2) * scale,
    (layer.height / 2 - y) * scale,
  ];
  if (layer.kind === "text") {
    if (!font) throw new Error("3D text outlines are unavailable");
    if (layer.text.length > 4096) throw new RangeError("3D text exceeds the outline budget");
    job.paths = layoutText(layer, font).map(({ glyph, x, baseline }) =>
      transform(glyph.getPath(x, baseline, layer.fontSize).commands, normalized),
    );
  } else {
    const vector = layer.vector;
    let view = [0, 0, layer.width, layer.height];
    let parts = [
      {
        path:
          layer.kind === "ellipse"
            ? `M0 ${layer.height / 2} A${layer.width / 2} ${layer.height / 2} 0 1 0 ${layer.width} ${layer.height / 2} A${layer.width / 2} ${layer.height / 2} 0 1 0 0 ${layer.height / 2}Z`
            : `M0 0H${layer.width}V${layer.height}H0Z`,
      },
    ];
    if (vector) {
      view = vector.viewBox
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      parts = vectorParts(vector);
    }
    job.paths = [];
    job.pathFillRules = [];
    job.pathParts = layer.kind === "vector" ? [] : undefined;
    if (parts.length > 256) throw new RangeError("3D SVG exceeds the part budget");
    for (const [partIndex, part] of parts.entries()) {
      if ("fill" in part && part.fill === "none") continue;
      const path = part.path
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;");
      const parsed = new SVGLoader().parse(
        `<svg xmlns="http://www.w3.org/2000/svg"><path d="${path}"/></svg>`,
      );
      for (const path of parsed.paths) {
        const combined: PathCommand[] = [];
        for (const subpath of path.subPaths) {
          const points = subpath.getPoints(Math.min(32, s.curveSegments));
          if (points.length < 3) continue;
          const commands: PathCommand[] = points.map((p, i) => ({
            type: i ? "L" : "M",
            x: p.x,
            y: p.y,
          }));
          commands.push({ type: "Z" });
          const matrix = "matrix" in part ? (part.matrix as number[] | undefined) : undefined;
          combined.push(
            ...transform(commands, (x, y) => {
              if (matrix)
                [x, y] = [
                  matrix[0]! * x + matrix[2]! * y + matrix[4]!,
                  matrix[1]! * x + matrix[3]! * y + matrix[5]!,
                ];
              return normalized(
                ((x - view[0]!) * layer.width) / view[2]!,
                ((y - view[1]!) * layer.height) / view[3]!,
              );
            }),
          );
        }
        job.paths.push(combined);
        job.pathParts?.push(partIndex);
        job.pathFillRules.push(
          ("fillRule" in part ? part.fillRule : "nonzero") === "evenodd" ? "evenodd" : "nonzero",
        );
      }
    }
  }
  return job;
}
