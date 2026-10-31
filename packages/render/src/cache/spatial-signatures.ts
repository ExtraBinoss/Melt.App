import {
  spatialLayerDependencies,
  type Composition,
  type Layer,
  type SpatialScene,
} from "@musart/core";
import { morphIdentity } from "../surface/morph/identity";
export interface SpatialSignatureSource {
  readonly layer: Layer;
  readonly contentIdentity: string;
  readonly worldMatrix: readonly number[];
  readonly visible: boolean;
  readonly inheritedOpacity: readonly number[];
}
/** Raw readiness signatures compare directly; shared IDs keep per-source keys linear in input size.
 * The caller owns the bounded, collision-free interner for this retained scene's lifetime.
 */
export function createSpatialDependencySignatures(
  page: Composition,
  settings: SpatialScene,
  sources: readonly SpatialSignatureSource[],
  environmentIdentity: string | null,
  identify: (signature: string) => string,
) {
  const inputs = sources.map((source) => ({
    source,
    parts: spatialLayerDependencies(source.layer),
  }));
  const geometry = JSON.stringify(
    inputs.map(({ source, parts }) => [source.layer.id, source.contentIdentity, parts.geometry]),
  );
  const appearance = JSON.stringify(
    inputs.map(({ source, parts }) => [source.layer.id, parts.appearance]),
  );
  const world = JSON.stringify(
    inputs.map(({ source, parts }) => [source.layer.id, source.worldMatrix, parts.pose]),
  );
  const projection = JSON.stringify([page.width, page.height, settings.viewport, settings.camera]);
  const coverage = inputs.map(({ source, parts }) => [
    source.layer.id,
    source.visible,
    source.inheritedOpacity,
    parts.coverage,
  ]);
  const depth = JSON.stringify([geometry, world, projection, coverage]);
  const shadows = JSON.stringify([
    geometry,
    world,
    coverage,
    settings.shadows,
    settings.shadows
      ? settings.lights.map((light) => [
          light.id,
          light.type,
          light.enabled,
          light.castShadow,
          light.x,
          light.y,
          light.z,
          light.targetX,
          light.targetY,
          light.targetZ,
          light.angle,
          light.softness,
        ])
      : null,
  ]);
  const lighting = [settings.environment, environmentIdentity, settings.lights];
  const probes = JSON.stringify([
    geometry,
    appearance,
    world,
    coverage,
    lighting,
    settings.shadows,
  ]);
  // Intern each global payload exactly once, rather than escaping it into every source key.
  const shared = {
    depth: identify(depth),
    shadows: identify(shadows),
    appearance: identify(appearance),
    lighting: identify(JSON.stringify(lighting)),
    probes: identify(probes),
  };
  const composite = JSON.stringify([
    shared.depth,
    shared.shadows,
    shared.appearance,
    shared.lighting,
    settings.reflections,
    sources.map(({ layer }) => [
      layer.id,
      layer.effects.map((effect) =>
        effect.shapeMorph ? { ...effect, shapeMorph: morphIdentity(effect.shapeMorph) } : effect,
      ),
      layer.mask,
      layer.opacity,
      layer.blendMode,
    ]),
  ]);
  const byId = new Map(
    inputs.map(({ source, parts }) => [
      source.layer.id,
      JSON.stringify([
        source.contentIdentity,
        parts.geometry,
        parts.appearance,
        parts.coverage,
        parts.pose,
        shared.depth,
        shared.shadows,
        shared.lighting,
        (settings.reflections?.mode ?? "scene") === "scene" ? shared.probes : null,
      ]),
    ]),
  );
  return {
    geometry,
    appearance,
    world,
    projection,
    depth,
    shadows,
    probes,
    composite,
    source: (layerId: string): string | null => byId.get(layerId) ?? null,
  };
}
export type SpatialDependencySignatures = ReturnType<typeof createSpatialDependencySignatures>;
