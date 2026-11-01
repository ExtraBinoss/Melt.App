import type { ShapeMorph } from "../effects/morph/model";
/** Compare only the supplied structural recipe, without serializing/copying its contours. */
export function sameMorph(a: ShapeMorph | undefined, b: ShapeMorph | undefined): boolean {
  if (a === b) return true;
  if (
    !a ||
    !b ||
    a.version !== b.version ||
    a.sourceText !== b.sourceText ||
    a.sourceFont?.family !== b.sourceFont?.family ||
    a.sourceFont?.size !== b.sourceFont?.size ||
    a.sourceFont?.weight !== b.sourceFont?.weight ||
    a.shapes.length !== b.shapes.length
  )
    return false;
  return a.shapes.every((shape, si) => {
    const other = b.shapes[si]!;
    return (
      shape.frames.length === other.frames.length &&
      shape.frames.every((frame, fi) => {
        const next = other.frames[fi]!;
        return (
          frame.at === next.at &&
          frame.easing === next.easing &&
          frame.box.every((value, i) => value === next.box[i]) &&
          frame.contours.length === next.contours.length &&
          frame.contours.every((contour, ci) => {
            const candidate = next.contours[ci]!;
            return (
              contour.hole === candidate.hole &&
              contour.points.length === candidate.points.length &&
              contour.points.every(
                (point, pi) =>
                  point[0] === candidate.points[pi]![0] && point[1] === candidate.points[pi]![1],
              )
            );
          })
        );
      })
    );
  });
}
