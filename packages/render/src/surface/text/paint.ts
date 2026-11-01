import type { Layer } from "@musart/core";
import { Vector4, type Node } from "three/webgpu";
import { uniform } from "three/tsl";
import { parseColor } from "../../compositing/nodes/color";
import { paintControls, paintNode, updatePaintControls } from "../paint";
import { glyphVertex } from "./vertex";
export const textPaint = () => ({
  ...paintControls(),
  stroke: uniform(new Vector4()),
  strokeWidth: uniform(0),
});
export function updateTextPaint(controls: ReturnType<typeof textPaint>, layer: Layer): void {
  updatePaintControls(controls, layer.fill, layer.width, layer.height, layer.fillGradient);
  controls.stroke.value.copy(parseColor(layer.stroke));
  controls.strokeWidth.value = layer.strokeWidth;
}
export const textPaintNode = (controls: ReturnType<typeof textPaint>, coordinate?: Node<"vec2">) =>
  paintNode(controls, coordinate ?? glyphVertex().pixel);
