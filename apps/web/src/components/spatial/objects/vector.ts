import { createLayer, createSpatialLayer, createSpatialScene, type EnginePort } from "@musart/core";
import type { CatalogAsset } from "@musart/assets";
import { vectorFromAsset } from "../../assets/selection";
import { brand } from "../../../ui/brand/config";
import { filledVectorOutlines } from "./vector-outlines";

/** SVGs enter the existing layer registry as ordinary editable geometry, in one transaction. */
export function insertLibraryVector(engine: EnginePort, asset: CatalogAsset, extrude: boolean) {
  const snapshot = engine.getSnapshot();
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const [, , sourceWidth, sourceHeight] = asset.viewBox.split(/[\s,]+/u).map(Number);
  const edge = Math.min(page.width, page.height) * 0.42;
  const ratio = sourceWidth! / sourceHeight!;
  const width = ratio >= 1 ? edge : edge * ratio;
  const height = ratio >= 1 ? edge / ratio : edge;
  const vector = vectorFromAsset(asset);
  const layer = createLayer("vector", {
    id: crypto.randomUUID(),
    name: asset.name,
    width,
    height,
    x: (page.width - width) / 2,
    y: (page.height - height) / 2,
    fill: brand.colors.primary,
    vector: extrude ? filledVectorOutlines(vector, brand.colors.primary) : vector,
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
