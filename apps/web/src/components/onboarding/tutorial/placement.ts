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
) {
  const gap = 22;
  const clamp = (value: number, max: number) => Math.max(12, Math.min(Math.max(12, max), value));
  const positions = [
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
  return positions.reduce((best, point) => (overlap(point) < overlap(best) ? point : best));
}
