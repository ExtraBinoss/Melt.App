import { resolveEffectSettings, type Bounds, type Effect } from "@musart/core";

/** Conservative source-local echo transport; document/selection geometry stays untouched. */
export function trailRenderBounds(
  effects: readonly Effect[],
  original: Bounds,
  content: { width: number; height: number },
): Bounds {
  let bounds = original;
  for (const effect of effects) {
    if (effect.type !== "trail" || !effect.enabled || effect.amount <= 0) continue;
    const settings = resolveEffectSettings(effect);
    if (!settings.expandBounds || Number(settings.fade) <= 0) continue;
    const angle = (Number(settings.angle) * Math.PI) / 180,
      dx = Number(settings.offsetX) * Math.cos(angle) - Number(settings.offsetY) * Math.sin(angle),
      dy = Number(settings.offsetX) * Math.sin(angle) + Number(settings.offsetY) * Math.cos(angle),
      cx = Number(settings.centerX) * content.width,
      cy = Number(settings.centerY) * content.height;
    const source = bounds;
    let left = source.x,
      top = source.y,
      right = source.x + source.width,
      bottom = source.y + source.height;
    for (let age = 1; age <= Number(settings.echoCount); age++) {
      const scale = (1 + Number(settings.spread)) ** age;
      left = Math.min(left, cx + (source.x - cx) * scale + dx * age);
      top = Math.min(top, cy + (source.y - cy) * scale + dy * age);
      right = Math.max(right, cx + (source.x + source.width - cx) * scale + dx * age);
      bottom = Math.max(bottom, cy + (source.y + source.height - cy) * scale + dy * age);
    }
    bounds = { x: left, y: top, width: right - left, height: bottom - top };
  }
  return bounds;
}
