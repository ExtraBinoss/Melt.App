import { createMotionEasingPreset as ease } from "@musart/core";
import { TemplateAuthor, seconds } from "../../motion/author";

export function createPaperMotion() {
  const a = new TemplateAuthor("paper-motion", "Paper Motion", 1080, 1350);
  a.commit([{ type: "updatePage", patch: { background: "#eae2d4" } }]);
  a.add([
    a.layer("text", "paper-edition", "Edition", {
      x: 64,
      y: 44,
      width: 940,
      height: 36,
      text: "MUSART  /  FORM & FEELING",
      fontFamily: "Space Grotesk",
      fontSize: 20,
      letterSpacing: 2,
      fill: "#4c5246",
    }),
    a.layer("text", "paper-title", "Paper Motion", {
      x: 52,
      y: 126,
      width: 976,
      height: 300,
      text: "PAPER\nMOTION",
      fontFamily: "Space Grotesk",
      fontWeight: 700,
      fontSize: 150,
      lineHeight: 0.9,
      letterSpacing: -7,
      fill: "#293c32",
    }),
    a.layer("group", "paper-collage", "Paper collage", { x: 140, y: 490, width: 800, height: 650 }),
    a.layer("rectangle", "paper-coral", "Coral paper", {
      parentId: "paper-collage",
      x: 40,
      y: 60,
      width: 470,
      height: 540,
      fill: "#ca715a",
      rotation: -11,
    }),
    a.layer("rectangle", "paper-blue", "Indigo paper", {
      parentId: "paper-collage",
      x: 350,
      y: 44,
      width: 350,
      height: 500,
      fill: "#626f9a",
      rotation: 10,
    }),
    a.layer("ellipse", "paper-sun", "Sun", {
      parentId: "paper-collage",
      x: 212,
      y: 188,
      width: 360,
      height: 360,
      fill: "#efd18d",
    }),
    a.layer("ellipse", "paper-hole", "Cut-out", {
      parentId: "paper-collage",
      x: 302,
      y: 278,
      width: 180,
      height: 180,
      fill: "#293c32",
    }),
    a.layer("text", "paper-footer", "Footer", {
      x: 64,
      y: 1200,
      width: 940,
      height: 80,
      text: "A STUDY IN SMALL MOVEMENTS.\nGROUPED. LAYERED. ENTIRELY EDITABLE.",
      fontFamily: "Space Grotesk",
      fontSize: 19,
      lineHeight: 1.5,
      letterSpacing: 1,
      fill: "#4c5246",
    }),
  ]);
  a.initialize();
  a.commit([
    ...a.layerKeys("paper-collage", "rotation", [
      [0, -3],
      [2.5, 3, ease("gentle")],
      [5, -3, ease("easeInOut")],
    ]),
    ...a.layerKeys("paper-coral", "rotation", [
      [0, -11],
      [2.5, -4, ease("gentle")],
      [5, -11, ease("easeInOut")],
    ]),
    ...a.layerKeys("paper-blue", "y", [
      [0, 44],
      [2.5, 12, ease("easeInOut")],
      [5, 44, ease("easeInOut")],
    ]),
    {
      type: "applyMotionTransition",
      layerId: "paper-title",
      style: "diagonal-wipe",
      placement: "in",
      duration: seconds(0.7),
      easing: ease("easeOut"),
    },
    {
      type: "applyMotionTransition",
      layerId: "paper-footer",
      style: "fade",
      placement: "in",
      duration: seconds(1.1),
      easing: ease("easeInOut"),
    },
  ]);
  return a.finish();
}
