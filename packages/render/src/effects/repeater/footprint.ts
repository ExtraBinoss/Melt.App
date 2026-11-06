import { resolveEffectSettings, type Effect } from "@musart/core";

interface Outset {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
interface Dimensions {
  width: number;
  height: number;
}
const ZERO: Outset = { left: 0, top: 0, right: 0, bottom: 0 };

/** Additional transport admission for all transformed upstream paint, in authored pixels. */
export function repeaterFootprint(effect: Effect, owner: Dimensions, input: Outset = ZERO): Outset {
  const s = resolveEffectSettings(effect),
    count = Math.min(16, Math.max(1, Math.floor(Number(s.count)))),
    columns = Math.max(1, Math.floor(Number(s.columns))),
    direction = (Number(s.angle) * Math.PI) / 180,
    cx = owner.width / 2,
    cy = owner.height / 2;
  if (count === 1 || Number(s.copyOpacity) === 0) return { ...ZERO };
  let left = -input.left,
    top = -input.top,
    right = owner.width + input.right,
    bottom = owner.height + input.bottom;
  const corners = [
    [-input.left, -input.top],
    [right, -input.top],
    [-input.left, bottom],
    [right, bottom],
  ] as const;
  for (let i = 1; i < count; i += 1) {
    const x = s.layout === "grid" ? (i % columns) * Number(s.spacingX) : i * Number(s.spacingX),
      y = s.layout === "grid" ? Math.floor(i / columns) * Number(s.spacingY) : 0,
      ring = ((i - 1) / Math.max(1, count - 1)) * 2 * Math.PI + direction,
      tx =
        s.layout === "radial"
          ? Math.cos(ring) * Number(s.radius)
          : x * Math.cos(direction) - y * Math.sin(direction),
      ty =
        s.layout === "radial"
          ? Math.sin(ring) * Number(s.radius)
          : x * Math.sin(direction) + y * Math.cos(direction),
      scale = Math.max(0.05, 1 + Number(s.scaleStep) * i),
      angle = (Number(s.rotationStep) * i * Math.PI) / 180;
    for (const [x, y] of corners) {
      const dx = (x - cx) * scale,
        dy = (y - cy) * scale,
        px = cx + tx + dx * Math.cos(angle) - dy * Math.sin(angle),
        py = cy + ty + dx * Math.sin(angle) + dy * Math.cos(angle);
      left = Math.min(left, px);
      top = Math.min(top, py);
      right = Math.max(right, px);
      bottom = Math.max(bottom, py);
    }
  }
  const margin = (value: number) => (value > 0.000001 ? Math.ceil(value) + 1 : 0);
  return {
    left: margin(-left - input.left),
    top: margin(-top - input.top),
    right: margin(right - owner.width - input.right),
    bottom: margin(bottom - owner.height - input.bottom),
  };
}
