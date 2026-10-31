import type { Composition } from "../document/model";
import { getDescendants, getAncestors } from "../layers/geometry";
import { SpatialGeometry } from "./geometry";
import { invertSpatial, multiplySpatial } from "./matrix";

/** Preserve native world frames across structural edits without decomposing shear or child TRS. */
export function captureSpatialReparent(page: Composition, roots: string[]) {
  const included = new Set(getDescendants(page, roots).map((layer) => layer.id));
  const native = page.layers.filter(
    (layer) =>
      included.has(layer.id) &&
      layer.spatial?.enabled &&
      !getAncestors(page, layer.id).some(
        (parent) => included.has(parent.id) && parent.spatial?.enabled,
      ),
  );
  const before = new SpatialGeometry(page);
  const anchors = native.map((layer) => ({ layer, anchor: before.anchorMatrix(layer.id) }));
  return () => {
    for (const { layer, anchor } of anchors) {
      delete layer.spatial!.basis;
      const base = new SpatialGeometry(page).anchorMatrix(layer.id);
      layer.spatial!.basis = multiplySpatial(invertSpatial(base), anchor);
    }
  };
}
