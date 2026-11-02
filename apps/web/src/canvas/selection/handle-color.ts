import { Color } from "three";
import type { Composition, Layer, VectorDefinition } from "@musart/core";
import { vectorContrast } from "../vector/contrast";

const palettes = new WeakMap<VectorDefinition, string>();
const painted = (color: string | undefined) => color && color !== "none" && color !== "transparent";
function colorOver(value: string, backdrop: Color): Color {
  if (!painted(value)) return backdrop.clone();
  const hex = value.slice(1);
  const full =
    hex.length <= 4
      ? hex
          .split("")
          .map((part) => part + part)
          .join("")
      : hex;
  return new Color(`#${full.slice(0, 6)}`).lerp(
    backdrop,
    full.length === 8 ? 1 - parseInt(full.slice(6), 16) / 255 : 0,
  );
}

/** One ink for the whole frame, estimated from authored paint. Never sample GPU pixels per handle. */
export function selectionHandleInk(
  layer: Layer,
  page: Pick<Composition, "background">,
): "#000000" | "#ffffff" {
  const backdrop = colorOver(page.background, new Color("#ffffff"));
  let candidate = layer.fill;
  const vector = layer.vector;
  if (
    vector?.preserveColors &&
    vector.parts?.length &&
    vector.parts.length <= 64 &&
    vector.parts.reduce((size, part) => size + part.path.length, 0) <= 64000 &&
    vector.parts.every(
      (part) => painted(part.fill) && (part.fill!.length === 4 || part.fill!.length === 7),
    )
  ) {
    candidate = palettes.get(vector) ?? vectorContrast(vector, layer.fill, layer.stroke).dominant;
    if (Object.isFrozen(vector)) palettes.set(vector, candidate);
  }
  let color = colorOver(candidate, backdrop);
  if (layer.fillGradient) {
    color = new Color(0);
    const stops = layer.fillGradient.stops;
    for (let i = 0; i < stops.length; i++) {
      const before = i ? (stops[i - 1]!.offset + stops[i]!.offset) / 2 : 0;
      const after = i + 1 < stops.length ? (stops[i]!.offset + stops[i + 1]!.offset) / 2 : 1;
      color.add(colorOver(stops[i]!.color, backdrop).multiplyScalar(after - before));
    }
  }
  color.lerp(backdrop, 1 - layer.opacity);
  const luminance = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  return 1.05 / (luminance + 0.05) > (luminance + 0.05) / 0.05 ? "#ffffff" : "#000000";
}

export function paintSelectionHandleInk(
  node: HTMLElement,
  layer: Layer,
  page: Pick<Composition, "background">,
) {
  const ink = selectionHandleInk(layer, page);
  const outline = ink === "#ffffff" ? "#000000" : "#ffffff";
  if (node.style.getPropertyValue("--canvas-handle-color") !== ink)
    node.style.setProperty("--canvas-handle-color", ink);
  if (node.style.getPropertyValue("--canvas-handle-outline") !== outline)
    node.style.setProperty("--canvas-handle-outline", outline);
}
