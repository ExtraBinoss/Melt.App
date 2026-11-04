import { createLayer, createSpatialLayer, createSpatialScene, type EnginePort } from "@musart/core";
import type { CatalogAsset } from "@musart/assets";
import { vectorFromAsset } from "../../../components/assets/selection";
import { brand } from "../../brand/config";

/** SVGs enter the existing layer registry as ordinary editable geometry, in one transaction. */
export function insertStudioVector(engine: EnginePort, asset: CatalogAsset, extrude: boolean) {
  const snapshot = engine.getSnapshot();
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const [, , sourceWidth, sourceHeight] = asset.viewBox.split(/[\s,]+/u).map(Number);
  const edge = Math.min(page.width, page.height) * 0.42;
  const ratio = sourceWidth! / sourceHeight!;
  const width = ratio >= 1 ? edge : edge * ratio;
  const height = ratio >= 1 ? edge / ratio : edge;
  const layer = createLayer("vector", {
    id: crypto.randomUUID(),
    name: asset.name,
    width,
    height,
    x: (page.width - width) / 2,
    y: (page.height - height) / 2,
    fill: brand.colors.primary,
    vector: vectorFromAsset(asset),
    ...(extrude ? { spatial: { ...createSpatialLayer("extrude"), depth: 0.3, bevel: 0.04 } } : {}),
  });
  const scene = extrude && !page.spatial ? createSpatialScene() : undefined;
  if (scene) for (const light of scene.lights) light.id = crypto.randomUUID();
  engine.transaction([
    { type: "addLayers", layers: [layer] },
    ...(scene ? [{ type: "updatePage" as const, patch: { spatial: scene } }] : []),
  ]);
  engine.select([layer.id]);
  return layer;
}
