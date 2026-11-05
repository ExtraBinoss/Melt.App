import {
  resolveCompositionEffectMotionProperty,
  listCompositionEffectMotionTargets,
  applyCompositionEffectMotionValue,
} from "./effect-properties";
import type { Composition } from "../../document/model";
import { ensure } from "../../errors";
import { DEFAULT_SPATIAL_SCENE } from "../../spatial/defaults";
import { propertyDependencies } from "../../spatial/properties";
import type { MotionPropertySchema } from "../properties/model";
import { isValidMotionValue, validateMotionValue } from "../properties/validation";
import type {
  SceneMotionPropertyTarget,
  SceneMotionPropertyDescriptor,
  SceneMotionFrameValue,
} from "./model";
const number = (min: number, max: number): MotionPropertySchema => ({
  kind: "number",
  min,
  max,
  interpolation: "continuous",
});
const choice = (options: readonly string[]): MotionPropertySchema => ({
  kind: "choice",
  options,
  interpolation: "hold",
});
const boolean: MotionPropertySchema = { kind: "boolean", interpolation: "hold" };
export const CAMERA_MOTION_SCHEMAS = {
  projection: choice(["perspective", "orthographic"]),
  yaw: number(-360000, 360000),
  pitch: number(-89.9, 89.9),
  distance: number(0.1, 100),
  fov: number(5, 120),
} as const;
export const ENVIRONMENT_MOTION_SCHEMAS = {
  intensity: number(0, 10),
  rotation: number(-360000, 360000),
} as const;
export const LIGHT_MOTION_SCHEMAS = {
  type: choice(["directional", "point", "spot"]),
  color: { kind: "color", format: "rgb", interpolation: "continuous" } as const,
  intensity: number(0, 100),
  x: number(-1000, 1000),
  y: number(-1000, 1000),
  z: number(-1000, 1000),
  targetX: number(-1000, 1000),
  targetY: number(-1000, 1000),
  targetZ: number(-1000, 1000),
  angle: number(1, 89),
  softness: number(0, 1),
  enabled: boolean,
  castShadow: boolean,
} as const;
export function sceneMotionAddress(target: SceneMotionPropertyTarget): string {
  return JSON.stringify([
    target.kind,
    target.compositionId,
    target.kind === "light" ? target.lightId : "effectId" in target ? target.effectId : null,
    target.property,
  ]);
}
export function resolveSceneMotionProperty(
  page: Composition,
  target: SceneMotionPropertyTarget,
): SceneMotionPropertyDescriptor | null {
  if (target.compositionId !== page.id || (target.kind === "light" && !page.spatial)) return null;
  if (target.kind === "compositionEffect" || target.kind === "compositionEffectSetting")
    return resolveCompositionEffectMotionProperty(page, target);
  const scene = page.spatial ?? DEFAULT_SPATIAL_SCENE;
  const schemas =
    target.kind === "camera"
      ? CAMERA_MOTION_SCHEMAS
      : target.kind === "environment"
        ? ENVIRONMENT_MOTION_SCHEMAS
        : target.kind === "light"
          ? LIGHT_MOTION_SCHEMAS
          : null;
  if (!schemas || !Object.hasOwn(schemas, target.property)) return null;
  const owner =
    target.kind === "camera"
      ? scene.camera
      : target.kind === "environment"
        ? scene.environment
        : scene.lights.find((light) => light.id === target.lightId);
  if (!owner) return null;
  const schema = (schemas as Readonly<Record<string, MotionPropertySchema>>)[target.property]!;
  const current = (owner as unknown as Record<string, unknown>)[target.property];
  // Legacy RGB shorthand is native-compatible; sampled light colors always emit RGB6.
  const value =
    target.kind === "light" &&
    target.property === "color" &&
    typeof current === "string" &&
    /^#[\da-f]{3}$/i.test(current)
      ? "#" + Array.from(current.slice(1), (digit) => digit + digit).join("")
      : current;
  if (!isValidMotionValue(schema, value)) return null;
  return {
    ...schema,
    target: { ...target },
    value,
    animatable: true,
    dependencies: propertyDependencies(target.kind, target.property),
  } as SceneMotionPropertyDescriptor;
}
export function listSceneMotionProperties(page: Composition): SceneMotionPropertyDescriptor[] {
  const targets: SceneMotionPropertyTarget[] = [
    ...listCompositionEffectMotionTargets(page),
    ...Object.keys(CAMERA_MOTION_SCHEMAS).map(
      (property) =>
        ({ kind: "camera", compositionId: page.id, property }) as SceneMotionPropertyTarget,
    ),
    ...Object.keys(ENVIRONMENT_MOTION_SCHEMAS).map(
      (property) =>
        ({ kind: "environment", compositionId: page.id, property }) as SceneMotionPropertyTarget,
    ),
    ...(page.spatial?.lights ?? []).flatMap((light) =>
      Object.keys(LIGHT_MOTION_SCHEMAS).map(
        (property) =>
          ({
            kind: "light",
            compositionId: page.id,
            lightId: light.id,
            property,
          }) as SceneMotionPropertyTarget,
      ),
    ),
  ];
  return targets.flatMap((target) => {
    const descriptor = resolveSceneMotionProperty(page, target);
    return descriptor ? [descriptor] : [];
  });
}
/** Only keys from the typed, registry-validated owner can be assigned. No arbitrary paths. */
export function applySceneMotionValues(
  page: Composition,
  values: readonly SceneMotionFrameValue[],
): Composition {
  let result = page;
  for (const { target, value } of values) {
    const descriptor = resolveSceneMotionProperty(result, target);
    ensure(descriptor, "INVALID_COMMAND", "Unknown scene Motion target");
    validateMotionValue(descriptor, value);
    if (Object.is(descriptor.value, value)) continue;
    if (target.kind === "compositionEffect" || target.kind === "compositionEffectSetting") {
      result = applyCompositionEffectMotionValue(result, target, value);
      continue;
    }
    const scene = result.spatial ?? DEFAULT_SPATIAL_SCENE;
    const spatial =
      target.kind === "camera"
        ? { ...scene, camera: { ...scene.camera, [target.property]: value } }
        : target.kind === "environment"
          ? { ...scene, environment: { ...scene.environment, [target.property]: value } }
          : {
              ...scene,
              lights: scene.lights.map((light) =>
                light.id === target.lightId ? { ...light, [target.property]: value } : light,
              ),
            };
    result = { ...result, spatial } as Composition;
  }
  return result;
}
