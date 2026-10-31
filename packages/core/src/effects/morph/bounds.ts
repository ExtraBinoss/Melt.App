import type { Layer } from "../../document/model";
import type { Bounds } from "../../layers/geometry";
import { resolveEffectSettings } from "../settings";

const cache = new WeakMap<Layer, Readonly<Bounds> | null>();

/** Authored source placement, with the same timing/easing/amount as the GPU morph. */
export function morphContentBounds(layer: Layer): Readonly<Bounds> | null {
  if (cache.has(layer)) return cache.get(layer)!;
  const effect = [...layer.effects].reverse().find((item) => item.enabled && item.type === "morph");
  const definition = effect?.shapeMorph;
  const font = definition?.sourceFont;
  if (
    !effect ||
    !definition ||
    (layer.kind === "text" &&
      (!layer.text.trim() ||
        (definition.sourceText !== undefined && definition.sourceText !== layer.text) ||
        (font &&
          (font.family !== layer.fontFamily ||
            font.size !== layer.fontSize ||
            font.weight !== layer.fontWeight))))
  ) {
    cache.set(layer, null);
    return null;
  }
  const settings = resolveEffectSettings(effect);
  const progress = Number(settings.progress),
    spread = Number(settings.stagger);
  const amount = effect.amount * (effect.opacity ?? 1);
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  definition.shapes.forEach((shape, index) => {
    const rank = definition.shapes.length > 1 ? index / (definition.shapes.length - 1) : 0;
    const order =
      settings.order === "reverse"
        ? 1 - rank
        : settings.order === "center"
          ? Math.abs(rank - 0.5) * 2
          : rank;
    const time = Math.min(1, Math.max(0, (progress - order * spread) / (1 - spread)));
    const initial = shape.frames[0]!;
    let box = initial.box;
    for (let i = 1; i < shape.frames.length; i++) {
      const a = shape.frames[i - 1]!,
        b = shape.frames[i]!;
      if (time < a.at) break;
      const linear = Math.min(1, Math.max(0, (time - a.at) / Math.max(1e-6, b.at - a.at)));
      const t =
        b.easing === "easeOut"
          ? 1 - (1 - linear) ** 3
          : b.easing === "easeInOut"
            ? linear * linear * (3 - 2 * linear)
            : linear;
      box = a.box.map((v, at) => v + (b.box[at]! - v) * t) as typeof box;
    }
    const [x, y, w, h] = box.map((v, at) => initial.box[at]! + (v - initial.box[at]!) * amount);
    left = Math.min(left, x! * layer.width);
    top = Math.min(top, y! * layer.height);
    right = Math.max(right, (x! + w!) * layer.width);
    bottom = Math.max(bottom, (y! + h!) * layer.height);
  });
  const bounds = Number.isFinite(left)
    ? Object.freeze({ x: left, y: top, width: right - left, height: bottom - top })
    : null;
  cache.set(layer, bounds);
  return bounds;
}
