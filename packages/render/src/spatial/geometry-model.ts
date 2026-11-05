import type { SpatialLayer, ShapeMorph } from "@musart/core";
export type PathCommand = {
  type: "M" | "L" | "Q" | "C" | "Z";
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
};
export interface SpatialGeometryJob {
  source: Exclude<SpatialLayer["source"], "glb" | "group">;
  depth: number;
  bevel: number;
  bevelSegments: number;
  curveSegments: number;
  /** A valid text source with no ink, including an intermediate deletion draft. */
  emptyText?: boolean;
  paths?: PathCommand[][];
  pathParts?: number[];
  pathFillRules?: ("nonzero" | "evenodd")[];
  morph?: {
    key: string;
    definition?: ShapeMorph;
    progress: number;
    stagger: number;
    order: string;
    amount: number;
    width: number;
    height: number;
  };
}
export interface GeometryPayload {
  attributes: { name: string; buffer: ArrayBuffer; itemSize: number }[];
  index?: ArrayBuffer;
}
