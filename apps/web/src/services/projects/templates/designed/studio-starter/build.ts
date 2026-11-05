import {
  createSpatialLayer,
  createSpatialLight,
  createSpatialScene,
  spatialMaterial,
} from "@musart/core";
import { brand } from "../../../../../ui/brand/config";
import { TemplateAuthor } from "../../motion/author";

/** One editable word in a landscape camera gate; no full-frame object placeholders. */
export function createStudioStarter() {
  const a = new TemplateAuthor("studio-starter", "Studio Starter", 1920, 1080);
  const scene = createSpatialScene();
  scene.camera = { projection: "perspective", yaw: -20, pitch: 10, distance: 4.8, fov: 35 };
  scene.environment = { preset: "softbox", assetId: null, intensity: 0.55, rotation: 20 };
  scene.reflections = { mode: "environment", quality: "balanced" };
  scene.shadows = true;
  scene.lights = [
    {
      ...createSpatialLight("directional"),
      id: "studio-key",
      x: -3,
      y: 4,
      z: 5,
      color: "#FFF2DE",
      intensity: 1.7,
      castShadow: true,
    },
    {
      ...createSpatialLight("directional"),
      id: "studio-fill",
      x: 3,
      y: 1,
      z: 2,
      color: "#C9D8FF",
      intensity: 0.6,
    },
    {
      ...createSpatialLight("point"),
      id: "studio-rim",
      x: 0,
      y: 1.5,
      z: -1,
      color: "#EAC4FF",
      intensity: 0.4,
    },
  ];
  const fontSize = 300;
  // Bundled Inter: ascender 1984, uppercase ink height 1490, unitsPerEm 2048.
  // Center the actual uppercase ink on the native transform/orbit origin.
  const height = (fontSize * (2 * 1984 - 1490)) / 2048;
  const title = a.layer("text", "studio-title", "MELT", {
    x: 410,
    y: (1080 - height) / 2,
    width: 1100,
    height,
    text: brand.name.toUpperCase(),
    fontFamily: "Inter",
    fontWeight: 800,
    fontSize,
    letterSpacing: -8,
    textAlign: "center",
    fill: "#7547E8",
    fillGradient: {
      kind: "linear",
      angle: 15,
      stops: [
        { offset: 0, color: "#5130A8" },
        { offset: 0.6, color: "#8554E4" },
        { offset: 1, color: "#C089ED" },
      ],
    },
    spatial: {
      ...createSpatialLayer("extrude"),
      x: 0,
      y: 0,
      z: 0,
      scaleX: 1.8,
      scaleY: 1.8,
      scaleZ: 1.8,
      depth: 0.3,
      bevel: 0.025,
      bevelSegments: 3,
      curveSegments: 12,
      material: { ...spatialMaterial("plastic").settings, roughness: 0.24, clearcoat: 0.8 },
    },
  });
  a.commit([
    { type: "updatePage", patch: { background: "#F1EEE8", spatial: scene } },
    { type: "addLayers", layers: [title] },
  ]);
  return a.finish();
}
