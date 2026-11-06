import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  type ImageAsset,
} from "../../../packages/core/src/index";
import { createRenderSession } from "../../../packages/render/src/index";
import { DepthClient } from "../../../apps/web/src/services/depth/client";
export async function runDepthWitness(forceWebGL: boolean, infer = false) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 64, 64);
  gradient.addColorStop(0, "#002288");
  gradient.addColorStop(1, "#ff9933");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = "#ee44cc";
  ctx.fillRect(20, 15, 25, 20);
  const source: ImageAsset = {
    id: "photo",
    name: "Photo",
    mime: "image/png",
    width: 64,
    height: 64,
    dataUrl: canvas.toDataURL(),
  };
  let depth = { ...source, id: "depth" };
  if (infer) {
    const client = new DepthClient();
    try {
      await client.model.prepare();
      const result = await client.generate(
        await fetch(source.dataUrl).then((r) => r.blob()),
        undefined,
        () => {},
      );
      const bitmap = await createImageBitmap(result.blob);
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      if (new Set(Array.from(pixels).filter((_, i) => i % 4 === 0)).size < 3)
        throw Error("Real DA3 produced no depth detail.");
      depth = { ...depth, width: canvas.width, height: canvas.height, dataUrl: canvas.toDataURL() };
    } finally {
      client.dispose();
    }
  }
  const assets = { photo: source, depth };
  const layer = createLayer("image", {
    id: "subject",
    assetId: "photo",
    width: 64,
    height: 64,
    x: 0,
    y: 0,
  });
  const page = createPage({
    id: "page",
    width: 64,
    height: 64,
    background: "transparent",
    layers: [layer],
  });
  createProject({ assets, pages: [page] });
  const session = createRenderSession({ forceWebGL, maxBytes: 32 * 1024 * 1024 });
  try {
    const render = () =>
      session.withCanvasFrame(page, assets, (canvas) => canvas.toDataURL("image/png"));
    const baseline = await render();
    layer.effects = [
      createEffect("depth-anything", {
        inputs: { depth: depth.id },
        settings: { view: "parallax" },
      }),
    ];
    const parallax = await render();
    layer.effects = [{ ...layer.effects[0]!, amount: 0 }];
    const zero = await render();
    layer.effects = [{ ...layer.effects[0]!, amount: 1, settings: { view: "depth" } }];
    const map = await render();
    return { baseline, parallax, zero, map, stats: session.stats() };
  } finally {
    await session.dispose();
  }
}
export async function runDepthVideoWitness() {
  const { createVideoFixture } = await import("./video-source-witness");
  const { probeVideoOriginal } = await import("../../../packages/render/src/index");
  const { EditorEngine, compileMotion, evaluateMotion, applyMotionFrame } =
    await import("../../../packages/core/src/index");
  const fixture = await createVideoFixture();
  const source = {
    ...(await probeVideoOriginal(fixture.blob)),
    id: "video",
    kind: "video" as const,
    name: "Video",
    mime: fixture.blob.type,
    originalId: "original",
    contentRevision: "one",
    byteLength: fixture.blob.size,
  };
  const client = new DepthClient();
  try {
    const result = await client.generate(fixture.blob, source, () => {});
    const depth = {
      ...(await probeVideoOriginal(result.blob)),
      id: "depth",
      kind: "video" as const,
      name: "Depth",
      mime: result.blob.type,
      originalId: "depth-original",
      contentRevision: "one",
      byteLength: result.blob.size,
    };
    const assets = { video: source, depth };
    const layer = createLayer("video", {
      id: "subject",
      assetId: source.id,
      width: 64,
      height: 64,
      x: 0,
      y: 0,
      effects: [
        createEffect("depth-anything", {
          inputs: { depth: depth.id },
          settings: { view: "parallax" },
        }),
      ],
    });
    const engine = new EditorEngine(
      createProject({
        assets,
        pages: [createPage({ id: "page", width: 64, height: 64, layers: [layer] })],
      }),
    );
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    const reports = [];
    for (const forceWebGL of [false, true]) {
      const session = createRenderSession({
        forceWebGL,
        maxBytes: 64 * 1024 * 1024,
        mediaResolver: {
          resolveOriginal: async (asset) => (asset.id === source.id ? fixture.blob : result.blob),
        },
      });
      try {
        const program = compileMotion(engine.getSnapshot().project, { compositionId: "page" });
        const images = [];
        for (const value of [0, 1, 0]) {
          const frame = evaluateMotion(program, { value, rate: 1 });
          images.push(
            await session.withCanvasFrame(
              applyMotionFrame(program, frame),
              assets,
              (canvas) => canvas.toDataURL(),
              { motionFrame: frame, mediaMode: "exact" },
            ),
          );
        }
        reports.push({ forceWebGL, images, stats: session.stats(), duration: depth.duration });
      } finally {
        await session.dispose();
      }
    }
    return reports;
  } finally {
    client.dispose();
  }
}
export async function runDepthLoadWitness() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const gradient = context.createLinearGradient(0, 0, 64, 64);
  gradient.addColorStop(0, "black");
  gradient.addColorStop(1, "white");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const image: ImageAsset = {
    id: "source",
    width: 64,
    height: 64,
    name: "Source",
    mime: "image/png",
    dataUrl: canvas.toDataURL(),
  };
  const depth = { ...image, id: "depth" };
  const page = createPage({
    width: 640,
    height: 320,
    layers: Array.from({ length: 50 }, (_, i) =>
      createLayer("image", {
        id: `image-${i}`,
        x: (i % 10) * 64,
        y: Math.floor(i / 10) * 64,
        width: 64,
        height: 64,
        assetId: image.id,
        effects: [createEffect("depth-anything", { inputs: { depth: depth.id } })],
      }),
    ),
  });
  const session = createRenderSession({ maxBytes: 32 * 1024 * 1024 });
  try {
    await session.withCanvasFrame(page, { source: image, depth }, () => {});
    return session.stats();
  } finally {
    await session.dispose();
  }
}
