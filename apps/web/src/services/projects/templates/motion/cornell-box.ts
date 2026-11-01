import {
  planMotionInitialization,
  SCENE_MOTION_ANIMATION_PRESETS,
  createSpatialLayer,
  createSpatialLight,
  createSpatialScene,
  spatialMaterial,
  type Layer,
  type SpatialLayer,
} from "@musart/core";
import { brand } from "../../../../ui/brand/config";
import { TemplateAuthor, seconds } from "./author";

export const CORNELL_DURATION = 8;
/** Separate engine-native objects share depth, shadows, probes and one editable parent. */
export function createCornellBox() {
  const a = new TemplateAuthor("cornell-box", "Cornell Box", 1080, 1080);
  const scene = createSpatialScene();
  scene.camera = { projection: "perspective", yaw: 5, pitch: 0, distance: 3.15, fov: 40 };
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
  function object(
    id: string,
    name: string,
    source: "box" | "sphere",
    color: string,
    position: [number, number, number],
    size: [number, number, number],
    patch: Partial<SpatialLayer> = {},
  ): Layer {
    const unit = source === "box" ? 1.8 : 2;
    return a.layer("rectangle", id, name, {
      width: 1080,
      height: 1080,
      fill: color,
      spatial: {
        ...createSpatialLayer(source),
        x: position[0],
        y: position[1],
        z: position[2],
        scaleX: size[0] / unit,
        scaleY: size[1] / unit,
        scaleZ: size[2] / unit,
        bevel: 0,
        material: { ...spatialMaterial("clay").settings },
        ...patch,
      },
    });
  }
  const chrome = {
    ...createSpatialLayer("extrude"),
    y: -0.32,
    z: -0.1,
    depth: 0.16,
    bevel: 0.014,
    bevelSegments: 4,
    curveSegments: 16,
    material: { ...spatialMaterial("chrome").settings, roughness: 0.16 },
  };
  const layers = [
    object("cornell-back", "Back wall", "box", "#E5E1D8", [0, 0, -1], [2.04, 2.04, 0.04]),
    object("cornell-left", "Red wall", "box", "#BD263A", [-1, 0, 0], [0.04, 2.04, 2.04]),
    object("cornell-right", "Green wall", "box", "#369E59", [1, 0, 0], [0.04, 2.04, 2.04]),
    object("cornell-floor", "Floor", "box", "#E5E1D8", [0, -1, 0], [2, 0.04, 2]),
    object("cornell-top", "Ceiling", "box", "#E5E1D8", [0, 1, 0], [2, 0.04, 2]),
    object(
      "cornell-emitter",
      "Ceiling panel",
      "box",
      "#FFFFFF",
      [0, 0.97, -0.05],
      [0.75, 0.015, 0.55],
      {
        castShadow: false,
        material: { ...spatialMaterial("clay").settings, emissiveIntensity: 4 },
      },
    ),
    object(
      "cornell-block",
      "Tall block",
      "box",
      "#B9BAB3",
      [-0.43, -0.4, -0.25],
      [0.58, 1.16, 0.6],
      { rotationY: -15 },
    ),
    object(
      "cornell-sphere",
      "Chrome sphere",
      "sphere",
      "#F1ECDD",
      [0.44, -0.56, 0.3],
      [0.84, 0.84, 0.84],
      {
        material: { ...spatialMaterial("chrome").settings, roughness: 0.26 },
      },
    ),
    a.layer("text", "cornell-melt", brand.name, {
      width: 1080,
      height: 1080,
      text: brand.name,
      fontFamily: "Inter",
      fontWeight: 800,
      fontSize: 240,
      textAlign: "center",
      fill: brand.colors.primary,
      spatial: chrome,
    }),
  ];
  a.commit([
    { type: "updatePage", patch: { background: "#151518", spatial: scene } },
    { type: "addLayers", layers },
  ]);
  const rig = a.group(
    layers.map((l) => l.id),
    "Cornell Box",
  );
  const group = a.engine.getSnapshot().project.pages[0]!.layers.find((l) => l.id === rig)!;
  a.commit([
    {
      type: "updateLayers",
      ids: [rig],
      patch: { spatial: { ...group.spatial!, pivot: [0, 0, 0], rotationY: 0 } },
    },
  ]);
  const plan = planMotionInitialization(a.engine.getSnapshot(), seconds(CORNELL_DURATION), {
    numerator: 60,
    denominator: 1,
  });
  a.commit([{ type: "setCompositionMode", mode: "motion", plan, confirmed: true }]);
  const orbit = SCENE_MOTION_ANIMATION_PRESETS.find((preset) => preset.id === "scene-camera-orbit");
  if (!orbit) throw Error("Missing reusable camera orbit preset");
  a.commit([
    {
      type: "addMotionAnimation",
      owner: { kind: "camera", compositionId: a.engine.getSnapshot().project.pages[0]!.id },
      preset: orbit,
      start: seconds(0),
      duration: seconds(CORNELL_DURATION),
    },
  ]);
  return a.finish();
}
