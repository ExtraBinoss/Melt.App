export interface VectorPoint {
  x: number;
  y: number;
}
export interface VectorNode extends VectorPoint {
  incoming?: VectorPoint;
  outgoing?: VectorPoint;
}
export interface VectorSubpath {
  closed: boolean;
  nodes: VectorNode[];
}
export type VectorNodeMode = "corner" | "smooth" | "symmetric";
