import { createEffect, createMotionEasingPreset as ease } from "@musart/core";
import { TemplateAuthor } from "../../motion/author";

export function createOrbitStudy() {
  const a = new TemplateAuthor("orbit-study", "Orbit Study", 1080, 1080);
  a.commit([{ type: "updatePage", patch: { background: "#17191f" } }]);
  const field = createEffect("gradient", {
    id: "orbit-field",
    time: 0,
    settings: { style: "aurora", color0: "#f1948a", color1: "#7658dd", color2: "#f2ce85" },
  });
  a.add([
    a.layer("text", "orbit-kicker", "Edition", {
      x: 64,
      y: 44,
      width: 920,
      height: 36,
      text: "MUSART     /     MOTION STUDIES     /     002",
      fontFamily: "Space Grotesk",
      fontSize: 18,
      letterSpacing: 2,
      fill: "#b5b3bf",
    }),
    a.layer("text", "orbit-title", "Orbit Study", {
      x: 54,
      y: 115,
      width: 980,
      height: 360,
      text: "ORBIT\nSTUDY",
      fontFamily: "Space Grotesk",
      fontWeight: 700,
      fontSize: 166,
      lineHeight: 0.92,
      letterSpacing: -8,
      fill: "#f4eadd",
    }),
    a.layer("ellipse", "orbit-ring", "Orbital path", {
      x: 130,
      y: 475,
      width: 820,
      height: 470,
      rotation: -24,
      fill: "#ffffff00",
      stroke: "#837a93",
      strokeWidth: 2,
    }),
    a.layer("ellipse", "orbit-field-layer", "Live color field", {
      x: 358,
      y: 386,
      width: 640,
      height: 640,
      effects: [field],
    }),
    a.layer("ellipse", "orbit-moon", "Small moon", {
      x: 154,
      y: 688,
      width: 98,
      height: 98,
      fill: "#eedfc8",
    }),
    a.layer("text", "orbit-caption", "Caption", {
      x: 64,
      y: 968,
      width: 620,
      height: 42,
      text: "COLOR IN CONSTANT CONVERSATION.",
      fontFamily: "Space Grotesk",
      fontSize: 18,
      letterSpacing: 1.5,
      fill: "#b5b3bf",
    }),
    a.layer("text", "orbit-duration", "Duration", {
      x: 840,
      y: 968,
      width: 170,
      height: 42,
      text: "05 SEC / LOOP",
      fontFamily: "Space Grotesk",
      fontSize: 17,
      textAlign: "right",
      fill: "#b5b3bf",
    }),
  ]);
  a.initialize();
  a.commit([
    ...a.keys(
      { kind: "effect", layerId: "orbit-field-layer", effectId: field.id, property: "time" },
      [
        [0, 0],
        [5, 5],
      ],
    ),
    ...a.layerKeys("orbit-field-layer", "x", [
      [0, 358],
      [2.5, 306, ease("easeInOut")],
      [5, 358, ease("easeInOut")],
    ]),
    ...a.layerKeys("orbit-moon", "y", [
      [0, 688],
      [2.5, 760, ease("gentle")],
      [5, 688, ease("easeInOut")],
    ]),
    ...a.layerKeys("orbit-ring", "rotation", [
      [0, -24],
      [2.5, -16, ease("easeInOut")],
      [5, -24, ease("easeInOut")],
    ]),
  ]);
  return a.finish();
}
