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
    previous ? Math.hypot(point.x - previous.x, point.y - previous.y) : 0;
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
  // Retain a free side, never old coordinates. Even a one-pixel viewport or
  // target movement produces an updated position instead of a deferred jump.
  return previous
    ? positions.reduce(
        (nearest, point) =>
          collisions(point) === collisions(best) && distance(point) < distance(nearest)
            ? point
            : nearest,
        best,
      )
    : best;
}
