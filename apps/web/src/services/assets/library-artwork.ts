import type { CatalogAsset } from "@musart/assets";
import type { EnginePort } from "@musart/core";
import { createArtworkLayer } from "../../canvas/interaction/shapes";
import type { Point } from "../../canvas/viewport/view";
import { placeLibraryLayer } from "./library-placement";

export function insertLibraryArtwork(engine: EnginePort, asset: CatalogAsset, point: Point) {
  const snapshot = engine.getSnapshot();
  const page = snapshot.project.pages.find((page) => page.id === snapshot.pageId)!;
  const [, , width, height] = asset.viewBox.split(/[\s,]+/u).map(Number);
  const edge = Math.min(180, Math.min(page.width, page.height) * 0.4);
  const ratio = width! / height!;
  const layer = createArtworkLayer(asset, point);
  layer.width = ratio >= 1 ? edge : edge * ratio;
  layer.height = ratio >= 1 ? edge / ratio : edge;
  placeLibraryLayer(page, layer, point);
  engine.execute({ type: "addLayers", layers: [layer] });
  engine.select([layer.id]);
  return layer;
}
