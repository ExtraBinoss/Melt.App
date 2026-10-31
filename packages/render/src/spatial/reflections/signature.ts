import type { Material } from "three/webgpu";
import type { CaptureMesh } from "./meshes";
import type { ReflectionSource } from "./model";
/** Only capture inputs, not effect graphs or large portable source paths. */
export function reflectionSignature(
  items: CaptureMesh[],
  sources: ReflectionSource[],
  environment: unknown,
  lights: unknown,
) {
  const rounded = (values: number[]) => values.map((value) => Math.round(value * 1e8) / 1e8);
  const appearance = (material: Material) => {
    const m = material as Material & {
      color?: import("three").Color;
      emissive?: import("three").Color;
      roughness?: number;
      metalness?: number;
      emissiveIntensity?: number;
      map?: import("three").Texture | null;
    };
    return [
      m.uuid,
      m.version,
      m.color?.getHex(),
      m.emissive?.getHex(),
      m.emissiveIntensity,
      m.roughness,
      m.metalness,
      m.opacity,
      m.map?.id,
      m.map?.version,
    ];
  };
  return JSON.stringify([
    environment,
    lights,
    sources.map(({ layer }) => [
      layer.id,
      layer.fill,
      layer.fillGradient,
      layer.spatial?.material,
      layer.spatial?.clip,
      layer.spatial?.clipTime,
      layer.vector?.parts?.map((part) => [part.fill, part.opacity]),
    ]),
    items.map((item) => [
      item.key,
      item.original.geometry.id,
      item.original.geometry.getAttribute("position")?.count,
      rounded(item.mapping.elements),
      rounded(item.original.matrixWorld.elements),
      item.original.morphTargetInfluences,
      item.opacity,
      (Array.isArray(item.original.material)
        ? item.original.material
        : [item.original.material]
      ).map(appearance),
    ]),
  ]);
}
