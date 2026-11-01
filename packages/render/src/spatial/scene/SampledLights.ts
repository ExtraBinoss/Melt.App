import {
  DirectionalLight,
  DirectionalLightNode,
  PointLight,
  PointLightNode,
  SpotLight,
  SpotLightNode,
  NodeUpdateType,
  type WebGPURenderer,
} from "three/webgpu";
import type { SpatialLight } from "@musart/core";

// Distinct light constructors own their node registration without replacing
// standard light classes or changing another scene's native light scheduling.
class SampledDirectionalLight extends DirectionalLight {}
class SampledPointLight extends PointLight {}
class SampledSpotLight extends SpotLight {}

// Exact/export samples can share one animation frame. Native analytic nodes also
// update attenuation and spot cones here, so retain their complete native update.
class SampledDirectionalLightNode extends DirectionalLightNode {
  override updateType = NodeUpdateType.RENDER;
}
class SampledPointLightNode extends PointLightNode {
  override updateType = NodeUpdateType.RENDER;
}
class SampledSpotLightNode extends SpotLightNode {
  override updateType = NodeUpdateType.RENDER;
}

let registered = false;
/** r187 registers node types on these private light subclasses. */
export function registerSampledLights(_renderer: WebGPURenderer) {
  if (registered) return;
  SampledDirectionalLight.registerNode(SampledDirectionalLightNode);
  SampledPointLight.registerNode(SampledPointLightNode);
  SampledSpotLight.registerNode(SampledSpotLightNode);
  registered = true;
}

export function createSampledLight(type: "directional"): DirectionalLight;
export function createSampledLight(type: "point"): PointLight;
export function createSampledLight(type: "spot"): SpotLight;
export function createSampledLight(
  type: SpatialLight["type"],
): DirectionalLight | PointLight | SpotLight;
export function createSampledLight(
  type: SpatialLight["type"],
): DirectionalLight | PointLight | SpotLight {
  return type === "directional"
    ? new SampledDirectionalLight()
    : type === "point"
      ? new SampledPointLight()
      : new SampledSpotLight();
}
