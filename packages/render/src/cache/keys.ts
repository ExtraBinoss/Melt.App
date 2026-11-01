import { effectAssetIds } from "@musart/core";
import {
  createLayerGeometryIndex,
  isPublishedComposition,
  type Asset,
  type Composition,
  type Layer,
  type LayerGeometryIndex,
} from "@musart/core";
import { AssetIdentities } from "./asset-identities";
import { SourceIdentities } from "./source-identities";
import { morphIdentity } from "../surface/morph/identity";
import type { ImmutableSourceFrame, SourceKeyCache } from "./source-key-cache";

const sourceIdentities = new SourceIdentities();
const assetIds = new AssetIdentities();
export function assetIdentity(asset: Asset | undefined): string {
  return assetIds.identity(asset);
}

export function sourceKey(
  layer: Layer,
  page: Composition,
  assets: Record<string, Asset>,
  scale: number,
  trail: ReadonlySet<string> = new Set(),
): string {
  return createSourceKeys(page, assets, scale, { trail })(layer);
}

/** One indexed, memoized key resolver for a render job, including shared mask dependencies. */
export function createSourceKeys(
  page: Composition,
  assets: Record<string, Asset>,
  scale: number,
  options: {
    trail?: ReadonlySet<string>;
    geometry?: LayerGeometryIndex;
    videoStamp?: (layerId: string) => string | null;
    spatialStamp?: (layerId: string) => string | null;
    cache?: SourceKeyCache;
    immutableFrame?: ImmutableSourceFrame;
  } = {},
): (layer: Layer) => string {
  const geometry = options.geometry ?? createLayerGeometryIndex(page);
  const keys = new WeakMap<Layer, string>();
  const visiting = new Set(options.trail);
  const retained =
    (isPublishedComposition(page) || options.immutableFrame?.page === page) &&
    options.cache?.accepts(page, scale)
      ? options.cache
      : undefined;
  return function resolve(layer: Layer): string {
    if (visiting.has(layer.id)) throw new Error("Cycle du graphe de rendu.");
    const cached = keys.get(layer);
    if (cached !== undefined) return cached;
    visiting.add(layer.id);
    try {
      const build = () => {
        const {
          id: _id,
          name: _name,
          x: _x,
          y: _y,
          rotation: _rotation,
          scaleX: _scaleX,
          scaleY: _scaleY,
          affine: _affine,
          opacity: _opacity,
          visible: _visible,
          locked: _locked,
          margin: _margin,
          padding: _padding,
          guides: _guides,
          parentId: _parentId,
          blendMode: _blendMode,
          ...source
        } = layer;
        const children = geometry
          .children(layer.id)
          .map((child) => [
            child.x,
            child.y,
            child.rotation,
            child.scaleX ?? 1,
            child.scaleY ?? 1,
            child.affine ?? null,
            child.opacity,
            child.visible,
            child.blendMode,
            resolve(child),
          ]);
        const maskSource =
          layer.mask?.enabled && layer.mask.layerId
            ? geometry.byId.get(layer.mask.layerId)
            : undefined;
        const maskKey = maskSource
          ? [
              geometry.worldMatrix(layer.id),
              geometry.worldMatrix(maskSource.id),
              [...geometry.ancestors(maskSource.id), maskSource].map((node) => [
                node.visible,
                node.opacity,
              ]),
              resolve(maskSource),
            ]
          : null;
        const key = sourceIdentities.intern(
          JSON.stringify([
            {
              ...source,
              effects: source.effects.map((effect) =>
                effect.shapeMorph
                  ? { ...effect, shapeMorph: morphIdentity(effect.shapeMorph) }
                  : effect,
              ),
            },
            scale,
            page.colorSpace ?? "srgb",
            layer.spatial?.enabled ? (page.spatial ?? null) : null,
            layer.spatial?.enabled ? (options.spatialStamp?.(layer.id) ?? null) : null,
            layer.spatial?.enabled && page.spatial?.environment.assetId
              ? assetIdentity(assets[page.spatial.environment.assetId])
              : null,
            maskKey,
            assetIdentity(layer.assetId ? assets[layer.assetId] : undefined),
            layer.kind === "video" ? (options.videoStamp?.(layer.id) ?? null) : null,
            assetIdentity(layer.mask?.assetId ? assets[layer.mask.assetId] : undefined),
            effectAssetIds(layer.effects).map((id) => [id, assetIdentity(assets[id])]),
            children,
          ]),
        );
        return key;
      };
      const key =
        retained && geometry.byId.get(layer.id) === layer
          ? retained.resolve(
              retained.address(page, layer, scale),
              layer,
              (emit) => {
                emit(page.colorSpace ?? "srgb");
                if (layer.spatial?.enabled) {
                  emit(retained.identity(page.spatial));
                  emit(options.spatialStamp?.(layer.id) ?? null);
                  emit(
                    assetIdentity(
                      page.spatial?.environment.assetId
                        ? assets[page.spatial.environment.assetId]
                        : undefined,
                    ),
                  );
                }
                emit(assetIdentity(layer.assetId ? assets[layer.assetId] : undefined));
                emit(layer.kind === "video" ? (options.videoStamp?.(layer.id) ?? null) : null);
                emit(assetIdentity(layer.mask?.assetId ? assets[layer.mask.assetId] : undefined));
                const effectIds = effectAssetIds(layer.effects);
                emit(effectIds.length);
                for (const id of effectIds) {
                  emit(id);
                  emit(assetIdentity(assets[id]));
                }
                const mask =
                  layer.mask?.enabled && layer.mask.layerId
                    ? geometry.byId.get(layer.mask.layerId)
                    : undefined;
                emit(!!mask);
                if (mask) {
                  for (const value of geometry.worldMatrix(layer.id)) emit(value);
                  for (const value of geometry.worldMatrix(mask.id)) emit(value);
                  const ancestors = geometry.ancestors(mask.id);
                  emit(ancestors.length);
                  for (const node of ancestors) {
                    emit(node.visible);
                    emit(node.opacity);
                  }
                  emit(mask.visible);
                  emit(mask.opacity);
                  emit(resolve(mask));
                }
                const children = geometry.children(layer.id);
                emit(children.length);
                for (const child of children) {
                  emit(child.x);
                  emit(child.y);
                  emit(child.rotation);
                  emit(child.scaleX ?? 1);
                  emit(child.scaleY ?? 1);
                  emit(!!child.affine);
                  if (child.affine) for (const value of child.affine) emit(value);
                  emit(child.opacity);
                  emit(child.visible);
                  emit(child.blendMode);
                  emit(resolve(child));
                }
              },
              build,
            )
          : build();
      keys.set(layer, key);
      return key;
    } finally {
      visiting.delete(layer.id);
    }
  };
}
