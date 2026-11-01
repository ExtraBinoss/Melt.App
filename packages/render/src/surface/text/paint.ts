import type { Layer } from "@musart/core";
import type { Node } from "three/webgpu";
import { paintControls, paintNode, updatePaintControls } from "../paint";
import { glyphVertex } from "./vertex";
export const textPaint = paintControls;
export function updateTextPaint(controls: ReturnType<typeof textPaint>, layer: Layer): void {
  updatePaintControls(controls, layer.fill, layer.width, layer.height, layer.fillGradient);
}
export const textPaintNode = (controls: ReturnType<typeof textPaint>, coordinate?: Node<"vec2">) =>
  paintNode(controls, coordinate ?? glyphVertex().pixel);
