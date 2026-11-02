export interface GuideBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Keep the card beside the whole popup, independently from its filtered rows. */
export function placeGuide(
  anchor: GuideBox,
  viewport: { width: number; height: number },
  width: number,
  height: number,
  previous?: { x: number; y: number },
) {
  const gap = 72;
  const clamp = (value: number, max: number) => Math.max(12, Math.min(Math.max(12, max), value));
  const positions = [
    ...(previous ? [previous] : []),
    { x: anchor.x - width - gap, y: anchor.y },
    { x: anchor.x + anchor.width + gap, y: anchor.y },
    { x: anchor.x, y: anchor.y - height - gap },
    { x: anchor.x, y: anchor.y + anchor.height + gap },
  ].map((point) => ({
    x: clamp(point.x, viewport.width - width - 12),
    y: clamp(point.y, viewport.height - height - 12),
  }));
  const overlap = (point: { x: number; y: number }) =>
    Math.max(0, Math.min(point.x + width, anchor.x + anchor.width) - Math.max(point.x, anchor.x)) *
    Math.max(0, Math.min(point.y + height, anchor.y + anchor.height) - Math.max(point.y, anchor.y));
  const score = (point: { x: number; y: number }) => {
    const clearance =
      Math.max(
        0,
        Math.min(point.x + width, anchor.x + anchor.width + 56) - Math.max(point.x, anchor.x - 56),
      ) *
      Math.max(
        0,
        Math.min(point.y + height, anchor.y + anchor.height + 12) -
          Math.max(point.y, anchor.y - 12),
      );
    return overlap(point) * 1e6 + clearance;
  };
  return positions.reduce((best, point) => (score(point) < score(best) ? point : best));
}
