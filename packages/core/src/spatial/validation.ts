import {
  assertBoolean,
  assertColor,
  assertList,
  assertNumber,
  assertRecord,
  assertUniqueId,
} from "../document/guards";
import { ensure } from "../errors";
import { SPATIAL_ENVIRONMENTS } from "./defaults";
import { SPATIAL_MATERIALS } from "./materials";
import { SPATIAL_PRIMITIVES, type SpatialLayer } from "./model";
export const SPATIAL_NUMBERS = {
  x: [-1000, 1000],
  y: [-1000, 1000],
  z: [-1000, 1000],
  rotationX: [-360000, 360000],
  rotationY: [-360000, 360000],
  rotationZ: [-360000, 360000],
  scaleX: [0.001, 100],
  scaleY: [0.001, 100],
  scaleZ: [0.001, 100],
  depth: [0.001, 100],
  bevel: [0, 2],
  bevelSegments: [1, 12],
  curveSegments: [3, 64],
  clip: [-1, 255],
  clipTime: [0, 86400],
} as const;
export const SPATIAL_MATERIAL_NUMBERS = {
  metalness: [0, 1],
  roughness: [0, 1],
  transmission: [0, 1],
  ior: [1, 2.333],
  clearcoat: [0, 1],
  clearcoatRoughness: [0, 1],
  sheen: [0, 1],
  iridescence: [0, 1],
  emissiveIntensity: [0, 10],
  opacity: [0, 1],
} as const;
export function validateSpatialLayer(value: unknown): asserts value is SpatialLayer {
  assertRecord(value);
  assertBoolean(value.enabled);
  ensure(
    [...SPATIAL_PRIMITIVES, "extrude", "glb"].includes(String(value.source)),
    "INVALID_DOCUMENT",
    "Unknown 3D source",
  );
  for (const [key, [min, max]] of Object.entries(SPATIAL_NUMBERS))
    assertNumber(value[key], min, max);
  for (const key of ["bevelSegments", "curveSegments", "clip"])
    ensure(
      Number.isInteger(value[key]),
      "INVALID_DOCUMENT",
      "3D subdivisions and clip indices must be integers",
    );
  assertBoolean(value.useModelMaterials);
  assertBoolean(value.castShadow);
  assertBoolean(value.receiveShadow);
  assertRecord(value.material);
  const material = value.material;
  ensure(
    SPATIAL_MATERIALS.some((item) => item.id === material.preset),
    "INVALID_DOCUMENT",
    "Unknown 3D material",
  );
  for (const [key, [min, max]] of Object.entries(SPATIAL_MATERIAL_NUMBERS))
    assertNumber(value.material[key], min, max);
}
export function validateSpatialScene(
  value: unknown,
  ids: Set<string>,
  assets: Record<string, unknown>,
): void {
  assertRecord(value);
  assertRecord(value.environment);
  ensure(
    SPATIAL_ENVIRONMENTS.includes(
      value.environment.preset as (typeof SPATIAL_ENVIRONMENTS)[number],
    ),
    "INVALID_DOCUMENT",
    "Unknown environment",
  );
  const assetId = value.environment.assetId;
  ensure(
    assetId === null ||
      (typeof assetId === "string" &&
        (assets[assetId] as { kind?: string } | undefined)?.kind === "environment"),
    "INVALID_DOCUMENT",
    "Missing environment original",
  );
  assertNumber(value.environment.intensity, 0, 10);
  assertNumber(value.environment.rotation, -360000, 360000);
  assertRecord(value.camera);
  ensure(
    ["perspective", "orthographic"].includes(String(value.camera.projection)),
    "INVALID_DOCUMENT",
    "Unknown 3D camera",
  );
  assertNumber(value.camera.yaw, -360000, 360000);
  assertNumber(value.camera.pitch, -89.9, 89.9);
  assertNumber(value.camera.distance, 0.1, 100);
  assertNumber(value.camera.fov, 5, 120);
  assertBoolean(value.shadows);
  assertList(value.lights, 8);
  for (const light of value.lights) {
    assertRecord(light);
    assertUniqueId(light.id, ids);
    ensure(
      ["directional", "point", "spot"].includes(String(light.type)),
      "INVALID_DOCUMENT",
      "Unknown light type",
    );
    assertColor(light.color);
    assertNumber(light.intensity, 0, 100);
    for (const key of ["x", "y", "z", "targetX", "targetY", "targetZ"])
      assertNumber(light[key], -1000, 1000);
    assertNumber(light.angle, 1, 89);
    assertNumber(light.softness, 0, 1);
    assertBoolean(light.enabled);
    assertBoolean(light.castShadow);
  }
}

/** Source capability/budget checks stay beside the portable 3D schema. */
export function validateSpatialSource(
  layer: Record<string, unknown>,
  assets: Record<string, unknown>,
) {
  if (layer.spatial === undefined) return;
  validateSpatialLayer(layer.spatial);
  const settings = layer.spatial;
  ensure(
    ["rectangle", "ellipse", "text", "vector"].includes(String(layer.kind)),
    "INVALID_DOCUMENT",
    "This layer cannot have a 3D source",
  );
  if (settings.source === "glb")
    ensure(
      typeof layer.assetId === "string" &&
        (assets[layer.assetId] as { kind?: string } | undefined)?.kind === "model3d",
      "INVALID_DOCUMENT",
      "Missing GLB original",
    );
  if ((settings.source !== "extrude" && settings.source !== "shape") || !settings.enabled) return;
  if (layer.kind === "text")
    ensure(
      typeof layer.text === "string" && layer.text.length <= 4096,
      "INVALID_DOCUMENT",
      "3D text exceeds the outline budget",
    );
  if (layer.kind === "vector") {
    const vector = layer.vector as { strokeOnly?: boolean; parts?: unknown[] };
    ensure(
      !vector.strokeOnly && (vector.parts?.length ?? 1) <= 256,
      "INVALID_DOCUMENT",
      "3D SVG extrusion requires at most 256 filled parts",
    );
  }
}
