import { createEffect, planMotionInitialization, type MotionAnimationPreset } from "@musart/core";
import { TemplateAuthor, seconds } from "../author";
import type { BuiltMotionTemplate, MotionTemplateMedia } from "../model";

export const SECOND_SKIN_DURATION = 10;
const ease = { type: "cubicBezier", x1: 0.22, y1: 1, x2: 0.36, y2: 1 } as const;

/** One original, two editable GPU treatments and sparse native Motion; no baked effects. */
export function createSecondSkin(media: MotionTemplateMedia): BuiltMotionTemplate {
  if (media.video.duration.value / media.video.duration.rate < SECOND_SKIN_DURATION)
    throw Error("Second Skin requires the ten-second dancer loop.");
  const a = new TemplateAuthor("second-skin", "Second Skin", 1080, 1920);
  a.add(
    [
      a.layer("video", "skin-dancer", "Dancer · cottonbro studio", {
        width: 1080,
        height: 1920,
        assetId: media.video.id,
      }),
      a.layer("group", "skin-title", "Second Skin / editable typography", {
        width: 1080,
        height: 1920,
      }),
      ...[
        { text: "SECOND", y: 68 },
        { text: "SKIN", y: 1695 },
      ].map(({ text, y }, i) =>
        a.layer("text", `skin-title-${i}`, text, {
          parentId: "skin-title",
          x: 72,
          y,
          width: 936,
          height: 205,
          text,
          fontFamily: "Space Grotesk",
          fontSize: 176,
          fontWeight: 700,
          letterSpacing: -7,
          lineHeight: 1,
          fill: "#f5f6f7",
        }),
      ),
    ],
    { video: media.video, photos: [], sounds: [] },
  );
  a.commit([{ type: "updatePage", patch: { background: "#08090b" } }]);
  const plan = planMotionInitialization(a.engine.getSnapshot(), seconds(SECOND_SKIN_DURATION), {
    numerator: 50,
    denominator: 1,
  });
  a.commit([{ type: "setCompositionMode", mode: "motion", plan, confirmed: true }]);
  a.commit([
    {
      type: "setMotionMedia",
      trackId: a.track("skin-dancer"),
      patch: { mute: true, volume: 0, sourceIn: seconds(0) },
    },
  ]);
  const treatments: MotionAnimationPreset = {
    version: 1,
    id: "skin-temperature-contour",
    name: "Temperature / contour",
    category: "stylize",
    duration: 10000,
    effects: [
      createEffect("thermal", {
        amount: 0,
        settings: {
          palette: "iron",
          low: 0.025,
          high: 0.55,
          gain: 1.55,
          gamma: 0.85,
          saturation: 1.05,
          edges: 0.16,
          grain: 0.008,
          speed: 0,
        },
      }),
      createEffect("edge-detect", {
        amount: 0,
        settings: {
          method: "scharr",
          smoothing: 1,
          width: 1.35,
          gain: 3,
          threshold: 0.1,
          softness: 0.12,
          foregroundColor: "#f3f5f7",
          backgroundColor: "#08090b",
          backgroundOpacity: 1,
        },
      }),
    ].map(({ id: _id, ...effect }) => effect),
    channels: [
      {
        target: { kind: "effect", slot: 0, property: "amount" },
        operation: "replace",
        points: [
          { at: 0, value: 0 },
          { at: 0.14, value: 0 },
          { at: 0.22, value: 1, easing: ease },
          { at: 0.46, value: 1 },
          { at: 0.54, value: 0, easing: ease },
          { at: 1, value: 0 },
        ],
      },
      {
        target: { kind: "effect", slot: 1, property: "amount" },
        operation: "replace",
        points: [
          { at: 0, value: 0 },
          { at: 0.54, value: 0 },
          { at: 0.62, value: 1, easing: ease },
          { at: 0.78, value: 1 },
          { at: 0.86, value: 0, easing: ease },
          { at: 1, value: 0 },
        ],
      },
    ],
  };
  const title: MotionAnimationPreset = {
    version: 1,
    id: "skin-title-reveal",
    name: "Second Skin / reveal",
    category: "reveal",
    effects: [],
    duration: 10000,
    channels: [
      {
        target: { kind: "layer", property: "opacity" },
        operation: "replace",
        points: [
          { at: 0, value: 0 },
          { at: 0.06, value: 1, easing: ease },
          { at: 0.94, value: 1 },
          { at: 1, value: 0, easing: ease },
        ],
      },
      {
        target: { kind: "layer", property: "y" },
        operation: "add",
        points: [
          { at: 0, value: 20 },
          { at: 0.06, value: 0, easing: ease },
          { at: 0.94, value: 0 },
          { at: 1, value: 20, easing: ease },
        ],
      },
    ],
  };
  for (const [layer, preset] of [
    ["skin-dancer", treatments],
    ["skin-title", title],
  ] as const)
    a.commit([
      {
        type: "addMotionAnimation",
        trackId: a.track(layer),
        preset,
        start: seconds(0),
        duration: seconds(SECOND_SKIN_DURATION),
      },
    ]);
  return a.finish();
}
