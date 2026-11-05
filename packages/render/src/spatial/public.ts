/** Lazy UI adapters borrow renderer-owned resources; portable documents never reference these. */
export { loadGlb, inspectGlb, glbMetadata, disposeModel, disposeModels } from "./glb";
export {
  createSpatialCamera,
  updateSpatialCamera,
  updateCompositionCamera,
  updateSpatialObject,
} from "./camera";
export type { SpatialResource } from "./SpatialResource";
export { decodeEnvironment, disposeEnvironmentInput } from "./environment-input";
export { pickSpatialLayer } from "./picking";
export { SpatialSelectionContour } from "./SelectionContour";
