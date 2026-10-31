import {
  createEffect,
  MOTION_ANIMATION_PRESETS,
  planMotionInitialization,
  type Layer,
} from "@musart/core";
import { TemplateAuthor, seconds } from "./author";
import type { BuiltMotionTemplate, MotionTemplateMedia } from "./model";
import {
  BLOOM_WINDOWS,
  BLOOM_WINDOWS_DURATION,
  BLOOM_WINDOW_CYCLE,
  bloomWindowPose,
} from "./bloom-windows-motion";

export { BLOOM_WINDOWS_DURATION } from "./bloom-windows-motion";
const W = 1920;
const H = 1080;

function treatment(id: (typeof BLOOM_WINDOWS)[number]["id"]) {
  if (id === "dither")
    return createEffect("dither", {
      id: "bw-dither-fx",
      scale: 5,
      levels: 2,
      color: false,
      seed: 718,
    });
  if (id === "ascii")
    return createEffect("ascii", {
      id: "bw-ascii-fx",
      scale: 13,
      color: false,
      settings: {
        characters: " .:-=+*#%@",
        palette: "solid",
        foreground: "#f2f5ce",
        background: "#14201c",
        contrast: 1.15,
        brightness: 0.04,
        gamma: 1.6,
        weight: 0.7,
      },
    });
  return createEffect("cyanotype", {
    id: "bw-cyanotype-fx",
    seed: 127,
    settings: {
      inkColor: "#123a74",
      paperColor: "#ecf2ff",
      exposure: 0.15,
      contrast: 1.2,
      gamma: 1.45,
      density: 1,
      wash: 0.04,
      unevenness: 0.08,
      paperGrain: 0.025,
      fibers: 0.02,
      edgeFade: 0,
    },
  });
}

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
        effects: [treatment(window.id)],
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
        x: pad + 12,
        y: pad - 44,
        width: 180,
        height: 30,
        text: window.label,
        fontFamily: "Inter",
        fontWeight: 500,
        fontSize: 23,
        letterSpacing: 0.5,
        fill: "#ffffff",
      }),
    );
  }
  a.add(
    [
      ...layers.filter(
        (layer) => !layer.id.endsWith("-label") && !layer.id.endsWith("-label-anchor"),
      ),
      ...layers.filter(
        (layer) => layer.id.endsWith("-label-anchor") || layer.id.endsWith("-label"),
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
