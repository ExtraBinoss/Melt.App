import {
  planMotionInitialization,
  createMotionEasingPreset,
  createSpatialLayer,
  createSpatialLight,
  createSpatialScene,
  spatialMaterial,
  type SceneAsset,
  type MotionAnimationPreset,
} from "@musart/core";
import { brand } from "../../../../ui/brand/config";
import { TemplateAuthor, seconds } from "./author";

export const CORNELL_DURATION = 8;
/** Two genuine 3D sources, ordinary Motion tracks and a precisely closed turntable. */
export function createCornellBox(room: SceneAsset) {
  const a = new TemplateAuthor("cornell-box", "Cornell Box", 1080, 1080);
  const scene = createSpatialScene();
  scene.camera = { projection: "perspective", yaw: 0, pitch: 0, distance: 3.15, fov: 40 };
  scene.environment.intensity = 0.32;
  scene.shadows = true;
  const key = {
    ...createSpatialLight("spot"),
    id: "cornell-ceiling",
    x: 0,
    y: 0.72,
    z: 0.28,
    targetX: 0,
    targetY: -0.85,
    targetZ: -0.18,
    intensity: 4,
    angle: 80,
    softness: 0.75,
    castShadow: true,
  };
  const red = {
    ...createSpatialLight("point"),
    id: "cornell-red-bounce",
    color: "#EC3448",
    x: -0.55,
    y: -0.15,
    z: 0.1,
    intensity: 0.045,
    castShadow: false,
  };
  const green = {
    ...createSpatialLight("point"),
    id: "cornell-green-bounce",
    color: "#64B678",
    x: 0.55,
    y: -0.1,
    z: 0.12,
    intensity: 0.04,
    castShadow: false,
  };
  scene.lights = [key, red, green];
  const model = { ...createSpatialLayer("glb"), rotationY: -5 };
  const chrome = {
    ...createSpatialLayer("extrude"),
    rotationY: -5,
    y: -0.26,
    z: 0.28,
    castShadow: false,
    receiveShadow: false,
    depth: 0.16,
    bevel: 0.014,
    bevelSegments: 4,
    curveSegments: 16,
    material: { ...spatialMaterial("chrome").settings, roughness: 0.16 },
  };
  a.commit([
    { type: "updatePage", patch: { background: "#151518", spatial: scene } },
    {
      type: "addLayers",
      assets: [room],
      layers: [
        a.layer("rectangle", "cornell-room", "Cornell Box", {
          width: 1080,
          height: 1080,
          assetId: room.id,
          spatial: model,
        }),
        a.layer("text", "cornell-melt", brand.name, {
          width: 1080,
          height: 1080,
          text: brand.name,
          fontFamily: "Inter",
          fontWeight: 800,
          fontSize: 280,
          textAlign: "center",
          fill: brand.colors.primary,
          spatial: chrome,
        }),
      ],
    },
  ]);
  const plan = planMotionInitialization(a.engine.getSnapshot(), seconds(CORNELL_DURATION), {
    numerator: 60,
    denominator: 1,
  });
  a.commit([{ type: "setCompositionMode", mode: "motion", plan, confirmed: true }]);
  const turntable: MotionAnimationPreset = {
    version: 1,
    id: "cornell-turntable",
    name: "3D · Turntable",
    category: "rotate",
    duration: CORNELL_DURATION * 1000,
    effects: [],
    channels: [
      {
        target: { kind: "layer", property: "spatial.rotationY" },
        operation: "replace",
        points: [
          { at: 0, value: -5 },
          { at: 0.5, value: 5, easing: createMotionEasingPreset("easeInOut") },
          { at: 1, value: -5, easing: createMotionEasingPreset("easeInOut") },
        ],
      },
    ],
  };
  a.commit(
    ["cornell-room", "cornell-melt"].map((id) => ({
      type: "addMotionAnimation",
      trackId: a.track(id),
      preset: turntable,
      start: seconds(0),
      duration: seconds(CORNELL_DURATION),
    })),
  );
  return a.finish();
}
