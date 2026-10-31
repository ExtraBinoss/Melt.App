import type { MeshPhysicalNodeMaterial, Node } from "three/webgpu";
import {
  abs,
  dot,
  float,
  materialIOR,
  materialOpacity,
  materialTransmission,
  max,
  normalView,
  output,
  positionViewDirection,
  pow,
  vec4,
} from "three/tsl";
/** Retain dielectric reflections when native transmission samples a transparent source backdrop. */
export function preserveTransmissionCoverage(material: MeshPhysicalNodeMaterial) {
  const f0 = pow(materialIOR.sub(1).div(materialIOR.add(1)), 2);
  const facing = abs(dot(normalView, positionViewDirection)).clamp(0, 1);
  const fresnel = f0.add(f0.oneMinus().mul(pow(facing.oneMinus(), 5)));
  material.outputNode = vec4(
    output.rgb,
    max(
      output.a,
      fresnel.mul(
        materialTransmission,
        float((material.opacityNode ?? materialOpacity) as Node<"float">),
      ),
    ),
  );
}
