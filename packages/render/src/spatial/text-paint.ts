import type { Layer } from "@musart/core";
import type { MeshPhysicalNodeMaterial, Node } from "three/webgpu";
import {
  materialOpacity,
  positionGeometry,
  sRGBTransferEOTF,
  uniform,
  vec2,
  vec3,
} from "three/tsl";
import { textPaint, textPaintNode, updateTextPaint } from "../surface/text/paint";
/** The existing editable gradient paints the extruded glyphs in their authored source coordinates. */
export function spatialTextPaint(material: MeshPhysicalNodeMaterial) {
  const controls = textPaint(),
    scale = uniform(1),
    width = uniform(1),
    height = uniform(1);
  const point = vec2(
    positionGeometry.x.div(scale).add(width.div(2)),
    height.div(2).sub(positionGeometry.y.div(scale)),
  );
  const paint = textPaintNode(controls, point);
  material.colorNode = vec3(sRGBTransferEOTF(paint.rgb) as Node<"vec3">);
  material.opacityNode = paint.a.mul(materialOpacity);
  return {
    update(layer: Layer) {
      scale.value = 2 / Math.min(layer.width, layer.height);
      width.value = layer.width;
      height.value = layer.height;
      updateTextPaint(controls, layer);
    },
  };
}
