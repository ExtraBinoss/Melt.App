import {
  createEffect,
  createLayer,
  createPage,
  createSpatialLayer,
  createSpatialScene,
  createProject,
  EditorEngine,
  compileMotion,
  evaluateMotion,
  applyMotionFrame,
  type EffectType,
  type Asset,
  type VideoAsset,
} from "../../../packages/core/src/index";
import { createRenderSession, probeVideoOriginal } from "../../../packages/render/src/index";
import { createVideoFixture } from "./video-source-witness";
export async function runMaterialEffects(forceWebGL: boolean) {
  const assets: Record<string, Asset> = {};
  const original = await fetch("/textures/normal.png").then((response) => response.blob());
  const mapUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(Error("Invalid image original"));
    reader.onerror = reject;
    reader.readAsDataURL(original);
  });
  assets.map = {
    id: "map",
    name: "Normal",
    mime: "image/png",
    width: 1024,
    height: 1024,
    dataUrl: mapUrl,
  };
  const photo =
    "data:image/svg+xml;base64," +
    btoa(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><linearGradient id="g"><stop stop-color="#2920aa"/><stop offset="1" stop-color="#ff7921"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><circle cx="32" cy="32" r="13" fill="#19dd88"/></svg>',
    );
  assets.photo = {
    id: "photo",
    name: "Source",
    mime: "image/svg+xml",
    width: 64,
    height: 64,
    dataUrl: photo,
  };
  let video: VideoAsset | undefined, blob: Blob | undefined;
  if (forceWebGL) {
    const fixture = await createVideoFixture();
    blob = fixture.blob;
    const meta = await probeVideoOriginal(blob);
    video = {
      id: "video",
      kind: "video",
      name: "Video",
      mime: blob.type,
      originalId: "original",
      contentRevision: "fixture",
      byteLength: blob.size,
      width: meta.width,
      height: meta.height,
      duration: meta.duration,
      firstTimestamp: meta.firstTimestamp,
      timeResolution: meta.timeResolution,
      orientation: meta.orientation,
    };
    assets.video = video;
  }
  const output: {
    kind: string;
    baseline: string;
    variants: { type: string; image: string; zero: string }[];
    stats: unknown;
  }[] = [];
  for (const kind of forceWebGL
    ? ["image", "shape", "spatial", "video"]
    : ["image", "shape", "spatial"]) {
    const spatial = createSpatialScene();
    spatial.reflections = { mode: "environment", quality: "draft" };
    spatial.shadows = false;
    const layer = createLayer(
      kind === "video"
        ? "video"
        : kind === "image"
          ? "image"
          : kind === "shape"
            ? "ellipse"
            : "rectangle",
      {
        id: "item",
        x: 0,
        y: 0,
        width: 64,
        height: 64,
        fill: "#8b5cf6",
        assetId: kind === "image" ? "photo" : kind === "video" ? "video" : null,
        ...(kind === "spatial" ? { spatial: createSpatialLayer("sphere") } : {}),
      },
    );
    const page = createPage({
      id: "page",
      width: 64,
      height: 64,
      background: "transparent",
      spatial,
      layers: [layer],
    });
    const engine = new EditorEngine(createProject({ assets, pages: [page] }));
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    const session = createRenderSession({
      forceWebGL,
      maxBytes: 64 * 1024 * 1024,
      ...(blob ? { mediaResolver: { resolveOriginal: async () => blob! } } : {}),
    });
    try {
      const render = async (seconds = 0) => {
        const project = engine.getSnapshot().project,
          program = compileMotion(project, { compositionId: "page" });
        const frame = evaluateMotion(program, { value: seconds, rate: 1 });
        const composition = applyMotionFrame(program, frame);
        return session.withCanvasFrame(
          composition,
          project.assets,
          (canvas) => canvas.toDataURL("image/png"),
          { motionFrame: frame },
        );
      };
      const baseline = await render(),
        variants = [];
      for (const type of ["bevel", "displace", "thermal"] as EffectType[]) {
        const effect = createEffect(type, {
          id: "fx",
          ...(type === "displace" ? { inputs: { map: "map" } } : {}),
        });
        engine.execute({ type: "updateLayers", ids: ["item"], patch: { effects: [effect] } });
        if (kind !== "video") {
          for (const value of [0, 1])
            engine.execute({
              type: "upsertMotionKeyframe",
              target: { kind: "effect", layerId: "item", effectId: "fx", property: "amount" },
              time: { value, rate: 1 },
              value,
            });
        }
        const image = await render(kind === "video" ? 0 : 1);
        if (kind === "video")
          engine.execute({
            type: "updateLayers",
            ids: ["item"],
            patch: { effects: [{ ...effect, amount: 0 }] },
          });
        variants.push({ type, image, zero: await render() });
        if (type === "displace") {
          const preserved = createEffect("displace", {
            id: "fx",
            inputs: { map: "map" },
            settings: { preserveAlpha: true },
          });
          engine.execute({ type: "updateLayers", ids: ["item"], patch: { effects: [preserved] } });
          const kept = await render(kind === "video" ? 0 : 1);
          if (kind === "video")
            engine.execute({
              type: "updateLayers",
              ids: ["item"],
              patch: { effects: [{ ...preserved, amount: 0 }] },
            });
          variants.push({ type: "displace-preserve", image: kept, zero: await render() });
        }
      }
      output.push({ kind, baseline, variants, stats: session.stats() });
    } finally {
      await session.dispose();
    }
  }
  if (!forceWebGL) {
    const layers = Array.from({ length: 50 }, (_, i) =>
      createLayer("image", {
        id: `load-${i}`,
        assetId: "photo",
        x: (i % 8) * 64,
        y: Math.floor(i / 8) * 64,
        width: 64,
        height: 64,
        effects: [createEffect("displace", { id: `load-fx-${i}`, inputs: { map: "map" } })],
      }),
    );
    const page = createPage({ width: 512, height: 448, layers });
    const session = createRenderSession({ maxBytes: 64 * 1024 * 1024 });
    try {
      await session.withCanvasFrame(page, assets, () => {});
      output.push({ kind: "50-image-load", baseline: "", variants: [], stats: session.stats() });
    } finally {
      await session.dispose();
    }
  }
  return output;
}
