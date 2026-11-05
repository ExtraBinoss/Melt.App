import {
  createPage,
  createProject,
  createSpatialScene,
  EditorEngine,
  planMotionInitialization,
  type SceneAsset,
} from "@musart/core";
import { spatialLibraryLayer } from "../../../services/assets/spatial-layer";
import type { SpatialLibraryEntry } from "./catalog";

/** Synthetic presentation document. No editor state or persisted history is touched. */
export function spatialLibraryDocument(entry: SpatialLibraryEntry, asset?: SceneAsset) {
  const scene = createSpatialScene();
  scene.camera.distance = 5.2;
  scene.camera.pitch = 35;
  scene.lights[0]!.id = "library-key";
  scene.environment.intensity = 0.8;
  const layer = spatialLibraryLayer(
    entry.kind === "model" ? "glb" : entry.source,
    256,
    entry.id,
    "library-object",
  );
  layer.fill = "#b8bcc4";
  layer.spatial!.castShadow = false;
  layer.spatial!.receiveShadow = false;
  if (asset) {
    layer.assetId = asset.id;
    layer.spatial!.useModelMaterials = entry.kind === "model" && (entry.originalMaterials ?? false);
  }
  const engine = new EditorEngine(
    createProject({
      id: "spatial-library-preview",
      pages: [
        createPage({
          id: "library-page",
          width: 256,
          height: 256,
          background: "#00000000",
          spatial: scene,
          layers: [layer],
        }),
      ],
      assets: asset ? { [asset.id]: asset } : {},
    }),
  );
  const plan = planMotionInitialization(
    engine.getSnapshot(),
    { value: 6, rate: 1 },
    { numerator: 30, denominator: 1 },
  );
  engine.execute({ type: "setCompositionMode", mode: "motion", plan });
  const track = engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!;
  engine.execute({
    type: "addMotionAnimation",
    trackId: track.id,
    start: { value: 0, rate: 1 },
    duration: { value: 6, rate: 1 },
    preset: {
      version: 1,
      id: "library-spin",
      name: "3D",
      category: "rotate",
      duration: 6000,
      effects: [],
      channels: [
        {
          target: { kind: "layer", property: "spatial.rotationY" },
          operation: "add",
          points: [
            { at: 0, value: 0 },
            { at: 1, value: 360 },
          ],
        },
      ],
    },
  });
  return engine.getSnapshot().project;
}
