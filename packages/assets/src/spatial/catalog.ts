import models from "../../data/spatial/models.json" with { type: "json" };
/** Curated local originals: only metadata is loaded with the UI, GLB bytes are lazy. */
export const SPATIAL_MODEL_CATALOG = Object.freeze(models.map((model) => Object.freeze(model)));
export type SpatialModelDefinition = (typeof SPATIAL_MODEL_CATALOG)[number];
