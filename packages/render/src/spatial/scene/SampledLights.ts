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

// Distinct light constructors extend this renderer's library without replacing its
// standard registrations or changing another scene's native light scheduling.
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

/** Register composition-owned native light nodes through Three's light extension API. */
export function registerSampledLights(renderer: WebGPURenderer) {
  const { library } = renderer;
  if (!library.getLightNodeClass(SampledDirectionalLight))
    library.addLight(SampledDirectionalLightNode, SampledDirectionalLight);
  if (!library.getLightNodeClass(SampledPointLight))
    library.addLight(SampledPointLightNode, SampledPointLight);
  if (!library.getLightNodeClass(SampledSpotLight))
    library.addLight(SampledSpotLightNode, SampledSpotLight);
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
