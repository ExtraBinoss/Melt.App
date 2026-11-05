/** Auxiliary-input witnesses use real native depth and sparse authored Motion. */
import {
  createLayer,
  createPage,
  createSpatialLayer,
  createSpatialScene,
  type Composition,
  type Effect,
  type EffectPreviewSource,
} from "../../packages/core/src/index";
import { CATALOG_CELL, catalogPhoto } from "./photo-source";

export function createDepthPreview(source: EffectPreviewSource, effect: Effect): Composition {
  const spatial = createSpatialScene();
  spatial.camera = { projection: "perspective", yaw: 0, pitch: 0, distance: 4.5, fov: 35 };
  spatial.reflections = { mode: "environment", quality: "draft" };
  spatial.shadows = false;
  return createPage({
    id: "catalog-page-depth-of-field",
    name: "Photographic still life with three native focus planes",
    ...CATALOG_CELL,
    background: "#142331",
    spatial,
    effects: [effect],
    layers: [
      catalogPhoto(source),
      ...[
        { x: 22, y: 78, size: 68, z: 0.7, fill: "#b7dcd5" },
        { x: 91, y: 48, size: 78, z: 0, fill: "#efa66c" },
        { x: 168, y: 59, size: 49, z: -0.7, fill: "#f2dcaa" },
      ].map((object, index) =>
        createLayer("ellipse", {
          id: `catalog-focus-plane-${index}`,
          x: object.x,
          y: object.y,
          width: object.size,
          height: object.size,
          fill: object.fill,
          spatial: {
            ...createSpatialLayer("sphere"),
            z: object.z,
            material: { ...createSpatialLayer("sphere").material, roughness: 0.3 },
          },
        }),
      ),
    ],
  });
}

export function createTemporalPreview(source: EffectPreviewSource, effect: Effect): Composition {
  const photo = catalogPhoto(source, {
    id: "catalog-moving-photo",
    x: 91,
    y: 40,
    width: 132,
    height: 99,
    rotation: 8,
  });
  const at = (seconds: number) => ({ value: Math.round(seconds * 1000), rate: 1000 });
  return createPage({
    id: "catalog-page-trail",
    name: "Photographic card with native echoes of prior authored poses",
    ...CATALOG_CELL,
    // Transparent upstream paint is essential: an opaque backdrop would cover prior poses.
    background: "transparent",
    layers: [photo],
    effects: [effect],
    motion: {
      version: 2,
      initialized: true,
      mode: "motion",
      duration: at(1.2),
      frameRate: { numerator: 30, denominator: 1 },
      tracks: [
        {
          id: "catalog-photo-occurrence",
          layerId: photo.id,
          start: at(0),
          end: at(1.2),
          properties: [
            {
              id: "catalog-photo-x",
              target: { kind: "layer", layerId: photo.id, property: "x" },
              keyframes: [
                { id: "catalog-x-start", time: at(0), value: -18 },
                { id: "catalog-x-end", time: at(1.2), value: 128 },
              ],
            },
            {
              id: "catalog-photo-rotation",
              target: { kind: "layer", layerId: photo.id, property: "rotation" },
              keyframes: [
                { id: "catalog-rotation-start", time: at(0), value: -18 },
                { id: "catalog-rotation-end", time: at(1.2), value: 14 },
              ],
            },
          ],
        },
      ],
    },
  });
}
