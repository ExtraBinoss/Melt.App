import { createEffect, planMotionInitialization, type Layer } from "@musart/core";
import { TemplateAuthor, seconds } from "./author";
import type { BuiltMotionTemplate, MotionTemplateMedia } from "./model";
import { BLOOM_WINDOWS, BLOOM_WINDOWS_DURATION, bloomWindowMotion } from "./bloom-windows-motion";

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

/** One shared source, three direct cropped effect surfaces: no nested transport/mask targets. */
export function createBloomWindows(media: MotionTemplateMedia): BuiltMotionTemplate {
  if (media.video.duration.value / media.video.duration.rate < BLOOM_WINDOWS_DURATION)
    throw Error("Bloom Windows requires a twelve-second video loop.");
  const a = new TemplateAuthor("bloom-windows", "Bloom Windows", W, H);
  const layers: Layer[] = [
    a.layer("video", "bw-original", "Bloom / original", {
      width: W,
      height: H,
      assetId: media.video.id,
    }),
  ];
  for (const [index, window] of BLOOM_WINDOWS.entries()) {
    const prefix = `bw-${window.id}`,
      pose = bloomWindowMotion(index)[0]!;
    const x = pose.x,
      y = pose.y;
    const box = { x, y, width: window.size, height: window.size };
    layers.push(
      a.layer("rectangle", `${prefix}-shadow`, `${window.label} / soft shadow`, {
        ...box,
        fill: "#ffffff",
        effects: [
          createEffect("shadow", {
            id: `${prefix}-shadow-fx`,
            amount: 0.34,
            settings: { offsetX: 0, offsetY: 14, radius: 20, shadowColor: "#0c1814" },
          }),
        ],
      }),
      a.layer("group", `${prefix}-window`, `${window.label} / effect window`, {
        ...box,
        effects: [treatment(window.id)],
      }),
      a.layer("video", `${prefix}-video`, `${window.label} / source sample`, {
        parentId: `${prefix}-window`,
        width: W,
        height: H,
        assetId: media.video.id,
        x: pose.videoX,
        y: pose.videoY,
      }),
      a.layer("text", `${prefix}-label`, `${window.label} / label`, {
        x: x + 12,
        y: y - 44,
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
      ...layers.filter((layer) => layer.kind !== "text"),
      ...layers.filter((layer) => layer.kind === "text"),
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
  for (const [index, window] of BLOOM_WINDOWS.entries()) {
    const prefix = `bw-${window.id}`,
      frames = bloomWindowMotion(index);
    for (const property of ["x", "y"] as const) {
      const easing = (pose: (typeof frames)[number]) =>
        property === "x" ? pose.easingX : pose.easingY;
      for (const suffix of ["window", "shadow", "label"])
        a.commit(
          a.layerKeys(
            `${prefix}-${suffix}`,
            property,
            frames.map((pose) => [
              pose.time,
              pose[property] + (suffix === "label" ? (property === "x" ? 12 : -44) : 0),
              easing(pose),
            ]),
          ),
        );
      a.commit(
        a.layerKeys(
          `${prefix}-video`,
          property,
          frames.map((pose) => [
            pose.time,
            property === "x" ? pose.videoX : pose.videoY,
            easing(pose),
          ]),
        ),
      );
    }
  }
  return a.finish();
}
