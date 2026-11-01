import { createEffect, validateShapeMorph, type MotionAnimationPreset } from "@musart/core";
import { TemplateAuthor, seconds } from "../author";
import { brand } from "../../../../../ui/brand/config";
import lettering from "./lettering.json" with { type: "json" };
import { meltMascotMorph } from "./mascot";
import type { BuiltMotionTemplate } from "../model";

/** Original Melt mascot on white; native vector morph and editable wordmark. */
export function createMorphingType(): BuiltMotionTemplate {
  const a = new TemplateAuthor("morphing-type", "Melt Mascot", 1920, 1080);
  a.commit([{ type: "updatePage", patch: { background: "#ffffff" } }]);
  const shapeMorph = meltMascotMorph();
  const points = shapeMorph.shapes[0]!.frames[0]!.contours[0]!.points;
  const path = points.map(([x, y], i) => `${i ? "L" : "M"}${x * 640} ${y * 640}`).join(" ") + "Z";
  const body = a.layer("vector", "melt-mascot-body", "Melt mascot", {
    x: 20,
    y: 380,
    width: 320,
    height: 320,
    fill: brand.colors.primary,
    vector: { path, viewBox: "0 0 640 640" },
  });
  a.add([
    body,
    ...[131, 201].map((x, i) =>
      a.layer("rectangle", `melt-eye-${i}`, `Eye ${i + 1}`, {
        x,
        y: 502.5,
        width: 28,
        height: 54,
        radius: 14,
        fill: "#ffffff",
      }),
    ),
    a.layer("text", "melt-wordmark", "Melt", {
      text: brand.name.toUpperCase(),
      x: 380,
      y: 0,
      width: 1500,
      height: 1080,
      fontFamily: "DynaPuff",
      fontSize: 121.5,
      fontWeight: 700,
      textAlign: "center",
      fill: brand.colors.primary,
    }),
  ]);
  a.initialize();
  a.commit([{ type: "setMotionDuration", duration: seconds(6) }]);
  for (const [index, x] of [131, 201].entries()) {
    const id = `melt-eye-${index}`;
    a.commit(
      a.layerKeys(id, "x", [
        [0, x],
        [0.35, x],
        [0.7, x - 9],
        [1.25, x + 9],
        [1.8, x],
        [6, x],
      ]),
    );
    a.commit(
      a.layerKeys(id, "scaleY", [
        [0, 1],
        [0.9, 1],
        [1, 0.08],
        [1.12, 1],
        [5.8, 1],
        [5.9, 0.08],
        [6, 1],
      ]),
    );
  }
  const definition: unknown = lettering;
  validateShapeMorph(definition);
  const { id: _id, ...effect } = createEffect("morph", {
    shapeMorph: definition,
    amount: 1,
    settings: { progress: 0, stagger: 0, inflate: 0.9, stretch: 3, order: "forward" },
  });
  const preset: MotionAnimationPreset = {
    version: 1,
    id: "melt-type-inflate",
    name: "Melt · Inflate & return",
    category: "typography",
    duration: 6000,
    effects: [effect],
    channels: [
      {
        target: { kind: "effectSetting", slot: 0, property: "progress" },
        operation: "replace",
        points: [
          { at: 0, value: 0 },
          { at: 0.4, value: 1, easing: { type: "linear" } },
          { at: 0.56, value: 1 },
          { at: 1, value: 0, easing: { type: "linear" } },
        ],
      },
    ],
  };
  a.commit([
    {
      type: "addMotionAnimation",
      trackId: a.track("melt-wordmark"),
      preset,
      start: seconds(0),
      duration: seconds(6),
    },
  ]);
  return a.finish();
}
