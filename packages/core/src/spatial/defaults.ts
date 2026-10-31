import { createId } from "../document/identity";
import type { SpatialLayer, SpatialLight, SpatialScene, SpatialSource } from "./model";
import { spatialMaterial } from "./materials";
export const SPATIAL_ENVIRONMENTS = [
  "studio",
  "softbox",
  "overcast",
  "sunset",
  "dawn",
  "night",
  "neon",
  "warm",
  "cool",
  "gallery",
  "contrast",
  "none",
] as const;
export function createSpatialLayer(source: SpatialSource = "box"): SpatialLayer {
  return {
    enabled: true,
    source,
    x: 0,
    y: 0,
    z: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    depth: 0.3,
    bevel: 0.04,
    bevelSegments: 3,
    curveSegments: 12,
    castShadow: true,
    receiveShadow: true,
    useModelMaterials: true,
    clip: -1,
    clipTime: 0,
    material: { ...spatialMaterial("plastic").settings },
  };
}
export function createSpatialLight(type: SpatialLight["type"] = "directional"): SpatialLight {
  return {
    id: createId("light"),
    type,
    color: "#FFFFFF",
    intensity: 3,
    x: 3,
    y: 4,
    z: 5,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    angle: 45,
    softness: 0.5,
    castShadow: false,
    enabled: true,
  };
}
export function createSpatialScene(): SpatialScene {
  return {
    environment: { preset: "studio", assetId: null, intensity: 1, rotation: 0 },
    camera: { projection: "perspective", yaw: 25, pitch: 15, distance: 4.5, fov: 35 },
    lights: [createSpatialLight()],
    shadows: false,
  };
}
const defaultScene = createSpatialScene();
Object.freeze(defaultScene.environment);
Object.freeze(defaultScene.camera);
for (const light of defaultScene.lights) Object.freeze(light);
Object.freeze(defaultScene.lights);
export const DEFAULT_SPATIAL_SCENE: Readonly<SpatialScene> = Object.freeze(defaultScene);
