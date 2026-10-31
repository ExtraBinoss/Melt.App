/** Portable 3D source data. Three objects, geometry and textures are renderer-owned. */
export const SPATIAL_PRIMITIVES = [
  "box",
  "sphere",
  "torus",
  "capsule",
  "cone",
  "cylinder",
  "circle",
  "plane",
  "ring",
  "dodecahedron",
  "icosahedron",
  "octahedron",
  "tetrahedron",
  "torusKnot",
  "lathe",
  "tube",
  "polyhedron",
  "edges",
  "wireframe",
  "shape",
] as const;
export type SpatialPrimitive = (typeof SPATIAL_PRIMITIVES)[number];
export type SpatialSource = SpatialPrimitive | "extrude" | "glb" | "group";
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
  /** Affine parent frame retained when a transformed group is dissolved. */
  basis?: number[];
  /** Group pivot in the stable composition layout plane. */
  pivot?: [number, number, number];
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
export type SpatialReflectionQuality = "draft" | "balanced" | "high";
export interface SpatialReflections {
  mode: "environment" | "scene";
  quality: SpatialReflectionQuality;
}
export interface SpatialScene {
  /** Original camera gate for selection crops; contains no renderer state. */
  viewport?: { width: number; height: number; x: number; y: number };
  /** Missing settings use the shared, bounded scene-reflection defaults. */
  reflections?: SpatialReflections;
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
