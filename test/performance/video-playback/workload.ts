import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  MOTION_ANIMATION_PRESETS,
  type MotionAnimationPreset,
  type Project,
  type VideoAsset,
} from "../../../packages/core/src/index";

export type Treatment = "raw" | "effects" | "motion";
const duration = { value: 8, rate: 1 };
const layout = (index: number, count: number) => {
  const columns = count <= 4 ? 2 : 4,
    rows = Math.ceil(count / columns);
  const width = (1920 - 32 * (columns + 1)) / columns;
  const height = (width * 9) / 16;
  return {
    x: 32 + (index % columns) * (width + 32),
    y: (1080 - rows * (height + 32) + 32) / 2 + Math.floor(index / columns) * (height + 32),
    width,
    height,
  };
};

/** Real independent originals; sparse action blocks never bake a frame-by-frame trajectory. */
export function videoPlaybackWorkload(
  assets: readonly VideoAsset[],
  treatment: Treatment = "motion",
  input?: Project,
  count = 8,
  staged = true,
): Project {
  if (assets.length !== 8 || assets.some((asset) => asset.width !== 1920 || asset.height !== 1080))
    throw new Error("The workload requires eight independent 1920 × 1080 originals.");
  if (new Set(assets.map((asset) => asset.contentRevision)).size !== 8)
    throw new Error("The workload must not collapse to copies of one decoded original.");
  if (![4, 8, 12, 16].includes(count)) throw new Error("Unsupported workload density.");
  const base = layout(0, 4);
  const layers = Array.from({ length: count }, (_, index) => {
    const asset = assets[index % assets.length]!,
      final = layout(index, count);
    const position =
      staged && index < 4
        ? layout(index, 4)
        : {
            x: final.x - (base.width - final.width) / 2,
            y: final.y - (base.height - final.height) / 2,
            width: base.width,
            height: base.height,
          };
    const effects =
      treatment === "raw"
        ? []
        : [
            createEffect(index % 3 === 0 ? "dither" : index % 3 === 1 ? "ascii" : "cyanotype", {
              scale: index % 3 === 1 ? 14 : 5,
            }),
            ...(treatment === "motion" ? [createEffect("blur", { amount: 0.08, scale: 6 })] : []),
          ];
    return createLayer("video", {
      id: `lab-video-${index}`,
      name: `${index + 1} · ${asset.name}`,
      assetId: asset.id,
      ...position,
      scaleX: staged && index < 4 ? 1 : final.width / base.width,
      scaleY: staged && index < 4 ? 1 : final.height / base.height,
      ...(treatment !== "raw" && index % 4 === 3
        ? { mask: { enabled: true, inverted: false, assetId: "lab-rounded-mask" } }
        : {}),
      effects,
    });
  });
  const page = createPage({
    id: "video-playback-lab",
    name: "Video Playback Lab",
    width: 1920,
    height: 1080,
    background: "#16121f",
    layers,
    motion: {
      version: 1,
      initialized: true,
      mode: "motion",
      duration,
      frameRate: { numerator: 60, denominator: 1 },
      tracks: layers.map((layer, index) => ({
        id: `lab-track-${index}`,
        layerId: layer.id,
        start: { value: !staged || index < 4 ? 0 : 4, rate: 1 },
        end: index >= 8 ? { value: 7, rate: 1 } : duration,
        properties: [],
        media: { sourceIn: { value: index >= 8 ? 1 : 0, rate: 1 }, mute: true, volume: 0 },
      })),
    },
  });
  const engine = new EditorEngine({
    ...(input ?? createProject()),
    name: `Video Playback Lab · ${treatment} · ${staged ? `4 → ${count}` : count}`,
    pages: [page],
    assets: {
      ...Object.fromEntries(assets.map((asset) => [asset.id, asset])),
      ...(treatment === "raw"
        ? {}
        : {
            "lab-rounded-mask": {
              id: "lab-rounded-mask",
              name: "Rounded video window",
              mime: "image/svg+xml",
              width: base.width,
              height: base.height,
              dataUrl: `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="${base.width}" height="${base.height}"><rect width="100%" height="100%" rx="54" fill="white"/></svg>`)}`,
            },
          }),
    },
  });
  for (let index = 0; index < Math.min(4, count); index++) {
    const final = layout(index, count),
      layer = layers[index]!;
    const values = {
      x: final.x - (base.width - final.width) / 2,
      y: final.y - (base.height - final.height) / 2,
      scaleX: final.width / base.width,
      scaleY: final.height / base.height,
    };
    const preset: MotionAnimationPreset = {
      version: 1,
      id: "lab-layout",
      name: "Layout handoff",
      category: "move",
      duration: 500,
      effects: [],
      channels: (["x", "y", "scaleX", "scaleY"] as const).map((property) => ({
        target: { kind: "layer", property },
        operation: "replace",
        points: [
          { at: 0, value: layer[property] ?? 1 },
          {
            at: 1,
            value: values[property],
            easing: { type: "cubicBezier", x1: 0.22, y1: 1, x2: 0.36, y2: 1 },
          },
        ],
      })),
    };
    if (staged && count > 4)
      engine.execute({
        type: "addMotionAnimation",
        trackId: `lab-track-${index}`,
        preset,
        start: { value: 15, rate: 4 },
        duration: { value: 1, rate: 2 },
      });
  }
  if (treatment === "motion")
    for (let index = 0; index < count; index++)
      engine.execute({
        type: "addMotionAnimation",
        trackId: `lab-track-${index}`,
        preset: MOTION_ANIMATION_PRESETS.find(
          (p) => p.id === (index % 2 ? "rotate-spin-reverse" : "rotate-spin"),
        )!,
        start: { value: !staged || index < 4 ? 0 : 4, rate: 1 },
        duration: { value: !staged || index < 4 ? 8 : 4, rate: 1 },
      });
  return engine.getSnapshot().project;
}
