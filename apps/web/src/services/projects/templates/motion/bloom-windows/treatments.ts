import { createEffect, type MotionAnimationPreset } from "@musart/core";
import { BLOOM_WINDOWS, BLOOM_WINDOWS_DURATION } from "./motion";

/** Each card owns its editable GPU stack and one slow, closed print-development curve. */
export function bloomTreatment(id: (typeof BLOOM_WINDOWS)[number]["id"]): MotionAnimationPreset {
  const effects =
    id === "dither"
      ? [
          createEffect("dither", { scale: 4, levels: 2, color: false, seed: 718 }),
          createEffect("cyanotype", {
            settings: {
              inkColor: "#351426",
              paperColor: "#f6a6d4",
              contrast: 1.3,
              density: 1.15,
              wash: 0,
              unevenness: 0.04,
              paperGrain: 0.035,
              fibers: 0.02,
              edgeFade: 0,
            },
          }),
        ]
      : id === "ascii"
        ? [
            createEffect("ascii", {
              scale: 11,
              color: false,
              settings: {
                characters: " .:+*#%@",
                palette: "solid",
                foreground: "#d9ff9a",
                background: "#112318",
                contrast: 1.4,
                brightness: 0.03,
                gamma: 1.35,
                weight: 0.65,
              },
            }),
            createEffect("grain", { amount: 0.045, scale: 1, seed: 329 }),
          ]
        : [
            createEffect("cyanotype", {
              seed: 127,
              settings: {
                inkColor: "#113b98",
                paperColor: "#e5efff",
                exposure: 0.12,
                contrast: 1.45,
                gamma: 1.3,
                density: 1.3,
                wash: 0.025,
                unevenness: 0.08,
                paperGrain: 0.035,
                fibers: 0.025,
                edgeFade: 0,
              },
            }),
            createEffect("halftone", { amount: 0.18, scale: 4, color: false }),
          ];
  const target =
    id === "dither"
      ? ({ kind: "effect", slot: 1, property: "amount" } as const)
      : ({
          kind: "effectSetting",
          slot: 0,
          property: id === "ascii" ? "weight" : "exposure",
        } as const);
  const [low, high] = id === "dither" ? [0.88, 1] : id === "ascii" ? [0.65, 0.85] : [0.12, 0.35];
  return {
    version: 1,
    id: `bloom-${id}-develop`,
    name: `${id === "dither" ? "Rose ink" : id === "ascii" ? "Living type" : "Blue print"} / slow develop`,
    category: "stylize",
    duration: BLOOM_WINDOWS_DURATION * 1000,
    effects: effects.map(({ id: _id, ...effect }) => effect),
    channels: [
      {
        target,
        operation: "replace",
        points: [
          { at: 0, value: low },
          {
            at: 0.5,
            value: high,
            easing: { type: "cubicBezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
          },
          { at: 1, value: low, easing: { type: "cubicBezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 } },
        ],
      },
    ],
  };
}
