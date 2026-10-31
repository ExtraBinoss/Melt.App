import type { Layer } from "@musart/core";
import { Vector4, type MeshPhysicalNodeMaterial, type Node } from "three/webgpu";
import { attribute, materialOpacity, sRGBTransferEOTF, uniformArray, uint, vec3 } from "three/tsl";
import { vectorParts } from "../surface/vector/geometry";
import { parseColor } from "../compositing/nodes/color";
/** Part IDs are immutable geometry; editable SVG paints remain small live uniforms. */
export function spatialVectorPaint(material: MeshPhysicalNodeMaterial, count: number) {
  const values = Array.from({ length: Math.max(1, Math.min(256, count)) }, () => new Vector4()),
    colors = uniformArray<"vec4">(values, "vec4");
  const paint = colors.element(uint(attribute("spatialPart", "float")));
  material.colorNode = vec3(sRGBTransferEOTF(paint.rgb) as Node<"vec3">);
  material.opacityNode = paint.a.mul(materialOpacity);
  return {
    update(layer: Layer) {
      const parts = layer.vector ? vectorParts(layer.vector) : [];
      for (let index = 0; index < values.length; index++) {
        const part = parts[index];
        const color = layer.vector?.preserveColors ? (part?.fill ?? layer.fill) : layer.fill;
        values[index]!.copy(parseColor(color === "none" ? "transparent" : color));
        if (part) values[index]!.w *= part.opacity ?? 1;
      }
    },
  };
}
