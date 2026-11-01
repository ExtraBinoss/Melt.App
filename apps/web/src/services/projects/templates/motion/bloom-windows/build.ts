import {
  createEffect,
  MOTION_ANIMATION_PRESETS,
  planMotionInitialization,
  type Layer,
} from "@musart/core";
import { TemplateAuthor, seconds } from "../author";
import type { BuiltMotionTemplate, MotionTemplateMedia } from "../model";
import {
  BLOOM_WINDOWS,
  BLOOM_WINDOWS_DURATION,
  BLOOM_WINDOW_CYCLE,
  bloomWindowPose,
} from "./motion";
import { bloomTreatment } from "./treatments";

export { BLOOM_WINDOWS_DURATION } from "./motion";
const W = 1920;
const H = 1080;

/** A two-keyframe orbit rig keeps each card and its sampled video registered together. */
export function createBloomWindows(media: MotionTemplateMedia): BuiltMotionTemplate {
  if (media.video.duration.value / media.video.duration.rate < BLOOM_WINDOWS_DURATION)
    throw Error("Bloom Windows requires a twelve-second video loop.");
  const a = new TemplateAuthor("bloom-windows", "Bloom Windows", W, H);
  const orbitId = "bw-orbit";
  const layers: Layer[] = [
    a.layer("video", "bw-original", "Bloom / original", {
      width: W,
      height: H,
      assetId: media.video.id,
      effects: [
        createEffect("saturation", { id: "bw-original-color", amount: 0.62 }),
        createEffect("contrast", { id: "bw-original-contrast", amount: 0.54 }),
        createEffect("vignette", { id: "bw-original-vignette", amount: 0.22, scale: 1.3 }),
      ],
    }),
    a.layer("group", orbitId, "Windows / orbit", { x: 0, y: (H - W) / 2, width: W, height: W }),
  ];
  for (const [index, window] of BLOOM_WINDOWS.entries()) {
    const prefix = `bw-${window.id}`,
      pose = bloomWindowPose(index),
      pad = 80,
      outer = window.size + pad * 2,
      sourceSize = Math.ceil(window.size * Math.SQRT2) + 4;
    const box = { x: pad, y: pad, width: window.size, height: window.size };
    layers.push(
      a.layer("group", `${prefix}-card`, `${window.label} / upright card`, {
        parentId: orbitId,
        x: pose.centerX - outer / 2,
        y: pose.centerY + (W - H) / 2 - outer / 2,
        width: outer,
        height: outer,
      }),
      a.layer("rectangle", `${prefix}-shadow`, `${window.label} / soft shadow`, {
        parentId: `${prefix}-card`,
        ...box,
        fill: "#14201c",
        effects: [
          createEffect("shadow", {
            id: `${prefix}-shadow-fx`,
            amount: 0.34,
            settings: { offsetX: 0, offsetY: 14, radius: 20, shadowColor: "#0c1814" },
          }),
        ],
      }),
      a.layer("group", `${prefix}-window`, `${window.label} / effect window`, {
        parentId: `${prefix}-card`,
        ...box,
      }),
      a.layer("group", `${prefix}-source-orbit`, `${window.label} / source registration`, {
        parentId: `${prefix}-window`,
        x: (window.size - sourceSize) / 2,
        y: (window.size - sourceSize) / 2,
        width: sourceSize,
        height: sourceSize,
      }),
      a.layer("video", `${prefix}-video`, `${window.label} / source sample`, {
        parentId: `${prefix}-source-orbit`,
        width: W,
        height: H,
        assetId: media.video.id,
        x: sourceSize / 2 - pose.offsetX - W / 2,
        y: sourceSize / 2 - pose.offsetY - H / 2,
      }),
      a.layer("group", `${prefix}-label-anchor`, `${window.label} / upright label`, {
        parentId: orbitId,
        x: pose.centerX - outer / 2,
        y: pose.centerY + (W - H) / 2 - outer / 2,
        width: outer,
        height: outer,
      }),
      a.layer("text", `${prefix}-label`, `${window.label} / label`, {
        parentId: `${prefix}-label-anchor`,
        x: pad + 55,
        y: pad - 29,
        width: window.size - 68,
        height: 22,
        text: window.label,
        fontFamily: "Inter",
        fontWeight: 600,
        fontSize: 15,
        letterSpacing: 0.9,
        fill: "#14201c",
      }),
    );
    // Chrome is composed from native shapes and editable text, above all effect cards.
    const chrome = [
      a.layer("rectangle", `${prefix}-chrome-border`, `${window.label} / frame`, {
        parentId: `${prefix}-label-anchor`,
        x: pad - 2,
        y: pad - 2,
        width: window.size + 4,
        height: window.size + 4,
        fill: "#00000000",
        stroke: window.ink,
        strokeWidth: 2,
      }),
      a.layer("rectangle", `${prefix}-chrome-title`, `${window.label} / title bar`, {
        parentId: `${prefix}-label-anchor`,
        x: pad - 2,
        y: pad - 38,
        width: window.size + 4,
        height: 38,
        fill: window.ink,
      }),
      ...[0, 1, 2].map((dot) =>
        a.layer("ellipse", `${prefix}-chrome-dot-${dot}`, `${window.label} / control ${dot + 1}`, {
          parentId: `${prefix}-label-anchor`,
          x: pad + 10 + dot * 13,
          y: pad - 23,
          width: 7,
          height: 7,
          fill: "#14201c",
          opacity: 1 - dot * 0.23,
        }),
      ),
    ];
    layers.splice(layers.length - 1, 0, ...chrome);
  }
  layers.push(
    a.layer("text", "bw-title", "Bloom / editable title", {
      x: 200,
      y: 54,
      width: 600,
      height: 58,
      text: "BLOOM.exe",
      fontFamily: "Inter",
      fontSize: 44,
      fontWeight: 600,
      letterSpacing: -1.8,
      fill: "#f6f2e8",
    }),
  );
  a.add(
    [
      ...layers.filter(
        (layer) =>
          !layer.id.endsWith("-label") &&
          !layer.id.endsWith("-label-anchor") &&
          !layer.id.includes("-chrome-"),
      ),
      ...layers.filter(
        (layer) =>
          layer.id.endsWith("-label-anchor") ||
          layer.id.endsWith("-label") ||
          layer.id.includes("-chrome-"),
      ),
    ],
    { ...media, photos: [], sounds: [] },
  );
  a.commit([{ type: "updatePage", patch: { background: "#14201c" } }]);
  const plan = planMotionInitialization(a.engine.getSnapshot(), seconds(BLOOM_WINDOWS_DURATION), {
    numerator: 60,
    denominator: 1,
  });
  a.commit([{ type: "setCompositionMode", mode: "motion", plan, confirmed: true }]);
  for (const window of BLOOM_WINDOWS)
    a.commit([
      {
        type: "addMotionAnimation",
        trackId: a.track(`bw-${window.id}-window`),
        preset: bloomTreatment(window.id),
        start: seconds(0),
        duration: seconds(BLOOM_WINDOWS_DURATION),
      },
    ]);
  for (const layer of layers.filter((layer) => layer.kind === "video"))
    a.commit([
      {
        type: "setMotionMedia",
        trackId: a.track(layer.id),
        patch: { mute: true, volume: 0, sourceIn: seconds(0) },
      },
    ]);
  const turns = (BLOOM_WINDOWS_DURATION / BLOOM_WINDOW_CYCLE) * 360;
  for (const layer of layers) {
    const direction =
      layer.id === orbitId || layer.id.endsWith("-source-orbit")
        ? 1
        : layer.id.endsWith("-card") ||
            layer.id.endsWith("-video") ||
            layer.id.endsWith("-label-anchor")
          ? -1
          : 0;
    if (direction) {
      const preset = structuredClone(
        MOTION_ANIMATION_PRESETS.find(
          (item) => item.id === (direction > 0 ? "rotate-spin" : "rotate-spin-reverse"),
        )!,
      );
      preset.channels[0]!.points[1]!.value = turns * direction;
      a.commit([
        {
          type: "addMotionAnimation",
          trackId: a.track(layer.id),
          preset,
          start: seconds(0),
          duration: seconds(BLOOM_WINDOWS_DURATION),
        },
      ]);
    }
  }
  return a.finish();
}
