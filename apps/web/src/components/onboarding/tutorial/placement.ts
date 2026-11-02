export interface GuideBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Prefer nearby, centered placements with room for Melt and the whole popup. */
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
    { x: anchor.x - width - gap, y: anchor.y + (anchor.height - height) / 2 },
    { x: anchor.x + anchor.width + gap, y: anchor.y + (anchor.height - height) / 2 },
    { x: anchor.x + (anchor.width - width) / 2, y: anchor.y - height - gap },
    { x: anchor.x + (anchor.width - width) / 2, y: anchor.y + anchor.height + gap },
  ].map((point) => ({
    x: clamp(point.x, viewport.width - width - 12),
    y: clamp(point.y, viewport.height - height - 12),
  }));
  const overlap = (point: { x: number; y: number }) =>
    Math.max(0, Math.min(point.x + width, anchor.x + anchor.width) - Math.max(point.x, anchor.x)) *
    Math.max(0, Math.min(point.y + height, anchor.y + anchor.height) - Math.max(point.y, anchor.y));
  const distance = (point: { x: number; y: number }) =>
    Math.hypot(
      point.x + width / 2 - anchor.x - anchor.width / 2,
      point.y + height / 2 - anchor.y - anchor.height / 2,
    );
  const collisions = (point: { x: number; y: number }) => {
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
  const best = positions.reduce((best, point) =>
    collisions(point) < collisions(best) ? point : best,
  );
  // Small menu movements can keep a nearby card still. An old step's position
  // must never win merely because it happens to be somewhere unobstructed.
  if (
    previous &&
    previous.x >= 12 &&
    previous.y >= 12 &&
    previous.x + width <= viewport.width - 12 &&
    previous.y + height <= viewport.height - 12 &&
    collisions(previous) <= collisions(best) &&
    distance(previous) <= distance(best) + 24
  )
    return previous;
  return best;
}
