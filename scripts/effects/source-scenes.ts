/** Portable photographic scenes; every treatment is evaluated by the production SDK graph. */
import {
  createEffect,
  createLayer,
  createPage,
  getEffectDefinition,
  type Composition,
  type Effect,
  type EffectPreviewScene,
  type EffectPreviewSource,
  type EffectType,
} from "../../packages/core/src/index";
import { createDepthPreview, createTemporalPreview } from "./photo-scenes";
import { CATALOG_CELL, catalogPhoto } from "./photo-source";

export interface CatalogScene {
  composition: Composition;
  title: string;
  source: EffectPreviewSource;
  scene: EffectPreviewScene;
  placement: "layer" | "composition" | "geometry";
  effect: Effect;
  /** An exact authored sample; the baker compiles its Motion program once. */
  sampleTime?: number;
}
/** Missing SDK preview metadata is a bake failure, never an invented successful thumbnail. */
export function createEffectCatalogScene(type: EffectType): CatalogScene {
  const definition = getEffectDefinition(type);
  const preview = definition.sdk?.preview;
  if (!preview) throw new Error(`No SDK preview declared for ${type}`);
  const effect = createEffect(type, {
    ...preview.effect,
    id: `catalog-effect-${type}`,
    ...(preview.effect?.settings
      ? { settings: { ...definition.defaults.settings, ...preview.effect.settings } }
      : {}),
  });
  const scene = preview.scene ?? "photo";
  const common = {
    title: `${type}: ${preview.source} (${scene})`,
    source: preview.source,
    scene,
    effect,
  };
  if (scene === "depth")
    return {
      ...common,
      placement: "composition",
      composition: createDepthPreview(preview.source, effect),
    };
  if (scene === "temporal")
    return {
      ...common,
      placement: "composition",
      composition: createTemporalPreview(preview.source, effect),
      sampleTime: 0.9,
    };
  if (definition.requirements?.scope === "composition")
    throw new Error(`Composition effect ${type} needs an explicit native preview scene`);
  if (definition.source === "geometry" && scene !== "typography")
    throw new Error(`Geometry effect ${type} needs a typography source`);
  const inset = ["shadow", "bevel", "torn-edges", "feather", "transition"].includes(type);
  const photo = catalogPhoto(preview.source, {
    ...(inset ? { x: 20, y: 15, width: 200, height: 150 } : {}),
    effects: scene === "typography" ? [] : [effect],
  });
  const layers =
    scene === "typography"
      ? [
          photo,
          createLayer("rectangle", {
            id: "catalog-type-scrim",
            x: 0,
            y: 0,
            ...CATALOG_CELL,
            fill: "#0d1823",
            opacity: 0.35,
          }),
          createLayer("text", {
            id: "catalog-native-type",
            x: 18,
            y: 45,
            width: 212,
            height: 95,
            text: type === "terminal" ? "> MELT_" : "MELT",
            fontFamily: "Inter",
            fontSize: type === "terminal" ? 37 : 67,
            fontWeight: 900,
            lineHeight: 1,
            fill: "#fff3d6",
            effects: [effect],
          }),
        ]
      : [photo];
  return {
    ...common,
    placement: definition.source === "geometry" ? "geometry" : "layer",
    composition: createPage({
      id: `catalog-page-${type}`,
      name: common.title,
      ...CATALOG_CELL,
      background: "#17202c",
      layers,
    }),
  };
}
