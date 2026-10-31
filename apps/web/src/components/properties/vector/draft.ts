import {
  editVectorPath,
  writeVectorPath,
  writeRoundedVectorPath,
  canRoundVectorNode,
  type VectorPart,
  type VectorSubpath,
  type VectorNode,
  type VectorCorner,
} from "@musart/core";
/** Mutable gesture data lives outside React's document state and never mutates its input. */
export class VectorDraft {
  paths: VectorSubpath[] = [];
  corners: VectorCorner[] = [];
  readonly error: string;
  constructor(source: VectorPart) {
    try {
      this.paths = editVectorPath(source.nodeEditing ? { path: source.nodeEditing.path } : source);
      this.corners = structuredClone(source.nodeEditing?.rounding ?? []);
      this.error = "";
    } catch (error) {
      this.error =
        error instanceof Error && error.message === "VECTOR_TOO_COMPLEX" ? "complex" : "failed";
    }
  }
  restore(paths: VectorSubpath[], corners: VectorCorner[] = this.corners) {
    this.paths = structuredClone(paths);
    this.corners = structuredClone(corners);
  }
  close(index: number, closed: boolean) {
    this.paths[index]!.closed = closed;
  }
  radius(contour: number, node: number) {
    return this.corners.find((c) => c.contour === contour && c.node === node)?.radius ?? 0;
  }
  round(contour: number, node: number, radius: number) {
    this.corners = this.corners.filter((c) => c.contour !== contour || c.node !== node);
    if (radius > 0) this.corners.push({ contour, node, radius });
  }
  anchors() {
    return new Map(this.corners.map((c) => [this.paths[c.contour]!.nodes[c.node]!, c.radius]));
  }
  reconcile(anchors: Map<VectorNode, number>) {
    this.corners = [];
    this.paths.forEach((path, contour) =>
      path.nodes.forEach((node, index) => {
        const radius = anchors.get(node);
        if (radius && canRoundVectorNode(path, index))
          this.corners.push({ contour, node: index, radius });
      }),
    );
  }
  outline() {
    return writeRoundedVectorPath(this.paths, this.corners);
  }
  part(source: VectorPart, style: Partial<VectorPart>): VectorPart {
    const path = writeVectorPath(this.paths),
      corners = this.corners;
    const result = {
      ...source,
      ...style,
      path: corners.length ? writeRoundedVectorPath(editVectorPath({ path }), corners) : path,
    };
    delete result.matrix;
    delete result.nodeEditing;
    if (corners.length)
      result.nodeEditing = { version: 1, path, rounding: structuredClone(corners) };
    return result;
  }
}
