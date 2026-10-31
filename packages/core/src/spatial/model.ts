/** Portable 3D source data. Three objects, geometry and textures are renderer-owned. */
export type SpatialPrimitive = "box" | "sphere" | "torus" | "capsule" | "cone" | "cylinder";
export type SpatialSource = SpatialPrimitive | "extrude" | "glb";
export interface SpatialMaterial {
  preset: string;
  metalness: number;
  roughness: number;
  transmission: number;
  ior: number;
  clearcoat: number;
  clearcoatRoughness: number;
  sheen: number;
  iridescence: number;
  emissiveIntensity: number;
  opacity: number;
}
export interface SpatialLayer {
  enabled: boolean;
  source: SpatialSource;
  x: number;
  y: number;
  z: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  depth: number;
  bevel: number;
  bevelSegments: number;
  curveSegments: number;
  castShadow: boolean;
  receiveShadow: boolean;
  /** Imported glTF clip sampled against explicit document time, never a wall clock. */
  useModelMaterials: boolean;
  clip: number;
  clipTime: number;
  material: SpatialMaterial;
}
export interface SpatialLight {
  id: string;
  type: "directional" | "point" | "spot";
  color: string;
  intensity: number;
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  angle: number;
  softness: number;
  castShadow: boolean;
  enabled: boolean;
}
export interface SpatialScene {
  environment: {
    preset: string;
    assetId: string | null;
    intensity: number;
    rotation: number;
  };
  camera: {
    projection: "perspective" | "orthographic";
    yaw: number;
    pitch: number;
    distance: number;
    fov: number;
  };
  lights: SpatialLight[];
  shadows: boolean;
}
