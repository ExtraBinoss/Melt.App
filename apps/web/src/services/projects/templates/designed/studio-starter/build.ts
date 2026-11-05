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
  scene.camera = { projection: "perspective", yaw: -10, pitch: 6, distance: 4.8, fov: 35 };
  scene.environment = { preset: "softbox", assetId: null, intensity: 0.8, rotation: 20 };
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
      intensity: 3.2,
      castShadow: true,
    },
    {
      ...createSpatialLight("directional"),
      id: "studio-fill",
      x: 3,
      y: 1,
      z: 2,
      color: "#C9D8FF",
      intensity: 1.4,
    },
    {
      ...createSpatialLight("point"),
      id: "studio-rim",
      x: 0,
      y: 1.5,
      z: -1,
      color: "#EAC4FF",
      intensity: 0.7,
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
    fill: "#B8A3E5",
    fillGradient: {
      kind: "linear",
      angle: 15,
      stops: [
        { offset: 0, color: "#A99ADE" },
        { offset: 0.6, color: "#D4BFEA" },
        { offset: 1, color: "#F1C8B4" },
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
      depth: 0.18,
      bevel: 0.012,
      bevelSegments: 3,
      curveSegments: 12,
      material: { ...spatialMaterial("plastic").settings, roughness: 0.28, clearcoat: 0.6 },
    },
  });
  a.commit([
    { type: "updatePage", patch: { background: "#F5F1EA", spatial: scene } },
    { type: "addLayers", layers: [title] },
  ]);
  return a.finish();
}
