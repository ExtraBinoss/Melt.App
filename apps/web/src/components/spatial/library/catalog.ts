import { SPATIAL_PRIMITIVES, type SpatialSource } from "@musart/core";
import { SPATIAL_MODEL_CATALOG, type SpatialModelDefinition } from "@musart/assets";
export type SpatialLibraryEntry =
  | {
      readonly id: string;
      readonly kind: "shape";
      readonly source: SpatialSource;
      readonly nameKey: string;
      readonly index: number;
    }
  | {
      readonly id: string;
      readonly kind: "model";
      readonly model: SpatialModelDefinition;
      readonly originalMaterials?: boolean;
      readonly nameKey: string;
      readonly index: number;
    };
export const SPATIAL_LIBRARY_SHAPES: readonly SpatialLibraryEntry[] = [
  ...SPATIAL_PRIMITIVES,
  "extrude" as const,
].map((source, index) => ({
  id: source,
  kind: "shape",
  source,
  nameKey: `primitives.${source}`,
  index,
}));
export const SPATIAL_LIBRARY_MODELS: readonly SpatialLibraryEntry[] = SPATIAL_MODEL_CATALOG.map(
  (model, index) => ({
    id: model.id,
    kind: "model",
    model,
    nameKey: model.nameKey,
    index: index + SPATIAL_LIBRARY_SHAPES.length,
  }),
);
export const SPATIAL_LIBRARY_ENTRIES = [...SPATIAL_LIBRARY_SHAPES, ...SPATIAL_LIBRARY_MODELS];
export const SPATIAL_LIBRARY_COLUMNS = 5;
export const SPATIAL_LIBRARY_ROWS = Math.ceil(
  SPATIAL_LIBRARY_ENTRIES.length / SPATIAL_LIBRARY_COLUMNS,
);
export function spatialLibrarySwatch(index: number) {
  return {
    backgroundImage: `url(${import.meta.env.BASE_URL}spatial/library.webp)`,
    backgroundSize: `${SPATIAL_LIBRARY_COLUMNS * 100}% ${SPATIAL_LIBRARY_ROWS * 100}%`,
    backgroundPosition: `${((index % SPATIAL_LIBRARY_COLUMNS) * 100) / (SPATIAL_LIBRARY_COLUMNS - 1)}% ${(Math.floor(index / SPATIAL_LIBRARY_COLUMNS) * 100) / (SPATIAL_LIBRARY_ROWS - 1)}%`,
  };
}
