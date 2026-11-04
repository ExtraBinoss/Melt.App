import {
  createSpatialLayer,
  createSpatialLight,
  createSpatialScene,
  spatialMaterial,
  type Layer,
  type SpatialLayer,
  type SpatialPrimitive,
} from "@musart/core";
import { brand } from "../../../../../ui/brand/config";
import { TemplateAuthor } from "../../motion/author";

/** A still, editable scene: real glyph extrusion, native primitives and shared lighting. */
export function createStudioStarter() {
  const a = new TemplateAuthor("studio-starter", "Studio Starter", 1440, 1080);
  const scene = createSpatialScene();
  scene.camera = { projection: "perspective", yaw: 8, pitch: 12, distance: 4.8, fov: 36 };
  scene.environment = { preset: "softbox", assetId: null, intensity: 0.8, rotation: 20 };
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
  function object(
    id: string,
    name: string,
    source: SpatialPrimitive,
    fill: string,
    patch: Partial<SpatialLayer>,
  ): Layer {
    return a.layer("rectangle", id, name, {
      width: 1440,
      height: 1080,
      fill,
      spatial: { ...createSpatialLayer(source), ...patch },
    });
  }
  const layers = [
    object("studio-plinth", "Porcelain stage", "box", "#F5EDE1", {
      x: 0,
      y: -0.68,
      z: -0.05,
      scaleX: 1.6,
      scaleY: 0.065,
      scaleZ: 0.75,
      material: { ...spatialMaterial("porcelain").settings, roughness: 0.32 },
    }),
    object("studio-orbit", "Lavender ring", "torus", "#A998EB", {
      x: -0.94,
      y: 0.08,
      z: -0.3,
      rotationX: 16,
      rotationY: 24,
      rotationZ: -18,
      scaleX: 0.37,
      scaleY: 0.37,
      scaleZ: 0.37,
      material: { ...spatialMaterial("ceramic").settings },
    }),
    object("studio-pearl", "Apricot pearl", "sphere", "#F1B99D", {
      x: 0.94,
      y: -0.27,
      z: 0.15,
      scaleX: 0.28,
      scaleY: 0.28,
      scaleZ: 0.28,
      material: { ...spatialMaterial("pearl").settings },
    }),
    object("studio-cube", "Brushed metal cube", "box", "#B7C7D8", {
      x: 0.76,
      y: 0.49,
      z: -0.36,
      rotationX: 18,
      rotationY: -24,
      rotationZ: 12,
      scaleX: 0.19,
      scaleY: 0.19,
      scaleZ: 0.19,
      material: { ...spatialMaterial("brushedAluminium").settings },
    }),
    a.layer("text", "studio-title", "Editable 3D lettering", {
      width: 1440,
      height: 1080,
      text: brand.name.toUpperCase(),
      fontFamily: "Inter",
      fontWeight: 800,
      fontSize: 300,
      letterSpacing: -12,
      textAlign: "center",
      fill: "#C5B5EE",
      fillGradient: {
        kind: "linear",
        angle: 12,
        stops: [
          { offset: 0, color: "#A79CE2" },
          { offset: 0.55, color: "#D9C2E5" },
          { offset: 1, color: "#F4C5A9" },
        ],
      },
      spatial: {
        ...createSpatialLayer("extrude"),
        x: -0.08,
        y: -0.08,
        z: 0.12,
        rotationY: -8,
        depth: 0.22,
        bevel: 0.014,
        bevelSegments: 4,
        curveSegments: 16,
        material: { ...spatialMaterial("plastic").settings, roughness: 0.28, clearcoat: 0.6 },
      },
    }),
    a.layer("text", "studio-eyebrow", "Edition label", {
      x: 80,
      y: 68,
      width: 1280,
      height: 50,
      text: "A SMALL STUDY IN POSSIBILITY",
      fontFamily: "Inter",
      fontWeight: 500,
      fontSize: 18,
      letterSpacing: 4,
      fill: "#656373",
    }),
    a.layer("text", "studio-caption", "Studio caption", {
      x: 80,
      y: 906,
      width: 1280,
      height: 105,
      text: "Shape something new.",
      fontFamily: "Inter",
      fontWeight: 500,
      fontSize: 44,
      letterSpacing: -1,
      fill: "#373443",
    }),
    a.layer("text", "studio-edition", "Edition number", {
      x: 1160,
      y: 933,
      width: 200,
      height: 40,
      text: "STUDIO / 001",
      fontFamily: "Inter",
      fontWeight: 500,
      fontSize: 17,
      letterSpacing: 1.5,
      textAlign: "right",
      fill: "#656373",
    }),
  ];
  a.commit([
    { type: "updatePage", patch: { background: "#F5F1EA", spatial: scene } },
    { type: "addLayers", layers },
  ]);
  return a.finish();
}
