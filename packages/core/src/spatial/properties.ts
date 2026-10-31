import type { Layer } from "../document/model";

/** Outputs affected by a property, shared by authoring and native render signatures. */
export type PropertyDependency =
  | "geometry"
  | "appearance"
  | "world"
  | "projection"
  | "depth"
  | "shadows"
  | "probes"
  | "composite";
export interface PropertyCapabilities {
  readonly animatable: true;
  readonly dependencies: readonly PropertyDependency[];
}
const pose: readonly PropertyDependency[] = ["world", "depth", "shadows", "probes", "composite"];
const geometry: readonly PropertyDependency[] = ["geometry", ...pose, "appearance"];
const paint: readonly PropertyDependency[] = ["appearance", "probes", "composite"];
const coverage: readonly PropertyDependency[] = [...paint, "depth", "shadows"];

/** Unknown effect controls stay conservative: source-owned morph effects can alter geometry. */
export function propertyDependencies(
  kind: string,
  property: string,
  effectType?: string,
): readonly PropertyDependency[] {
  if (kind === "camera") return ["projection", "depth", "composite"];
  if (kind === "environment") return paint;
  if (kind === "light")
    return ["color", "intensity"].includes(property)
      ? paint
      : ["appearance", "shadows", "probes", "composite"];
  if (kind === "effect" || kind === "effectSetting")
    return effectType === "morph" ? geometry : ["composite"];
  if (property.startsWith("spatial.material."))
    return ["opacity", "transmission"].includes(property.slice(17)) ? coverage : paint;
  if (property.startsWith("spatial."))
    return ["depth", "bevel", "bevelSegments", "curveSegments", "clip", "clipTime"].includes(
      property.slice(8),
    )
      ? geometry
      : pose;
  if (["x", "y", "rotation", "scaleX", "scaleY", "affine"].includes(property)) return pose;
  if (["opacity", "visible"].includes(property)) return coverage;
  if (["blendMode"].includes(property)) return ["composite"];
  if (["fill", "stroke", "fillGradient.angle", "fillGradient.kind"].includes(property))
    return paint;
  return geometry;
}

/** The same partitions used to classify authored properties are serializable render inputs. */
export function spatialLayerDependencies(layer: Layer) {
  const s = layer.spatial;
  return {
    geometry: s
      ? [s.source, s.depth, s.bevel, s.bevelSegments, s.curveSegments, s.clip, s.clipTime]
      : null,
    appearance: [
      layer.fill,
      layer.fillGradient,
      layer.stroke,
      layer.strokeWidth,
      layer.vector?.parts?.map((part) => [part.fill, part.opacity]),
      s?.material,
      s?.useModelMaterials,
      s?.receiveShadow,
    ],
    // Native transparent coverage is conservative; roughness/paint never invalidates opaque depth.
    coverage: [
      layer.opacity,
      layer.visible,
      paintAlpha(layer.fill),
      paintAlpha(layer.stroke),
      layer.fillGradient?.stops.map((stop) => paintAlpha(stop.color)),
      layer.vector?.parts?.map((part) => [paintAlpha(part.fill), part.opacity]),
      s?.useModelMaterials,
      s?.material.opacity,
      s?.material.transmission,
      s?.castShadow,
      layer.mask?.enabled ? layer.mask : null,
    ],
    pose: [
      layer.x,
      layer.y,
      layer.rotation,
      layer.scaleX,
      layer.scaleY,
      layer.affine,
      s?.basis,
      s?.pivot,
      s?.x,
      s?.y,
      s?.z,
      s?.rotationX,
      s?.rotationY,
      s?.rotationZ,
      s?.scaleX,
      s?.scaleY,
      s?.scaleZ,
    ],
  };
}

function paintAlpha(color: string | undefined): number {
  if (!color || color.toLowerCase() === "transparent") return 0;
  if (color.length === 5) return parseInt(color[4]! + color[4]!, 16) / 255;
  return color.length === 9 ? parseInt(color.slice(7), 16) / 255 : 1;
}
