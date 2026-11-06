import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  type Effect,
  type EffectType,
  type Asset,
  type Layer,
} from "../../../packages/core/src/index";
import { createRenderSession } from "../../../packages/render/src/index";

const treatments: { type: EffectType; patch?: Partial<Effect>; alternate: Partial<Effect> }[] = [
  {
    type: "glow",
    patch: { settings: { radius: 10, threshold: 0.1 } },
    alternate: { settings: { radius: 3, threshold: 0.9 } },
  },
  {
    type: "neon-melt",
    patch: { settings: { radius: 8, distortion: 4 } },
    alternate: { settings: { radius: 8, distortion: 4, phase: 1.7, palette: "ultraviolet" } },
  },
  {
    type: "repeater",
    patch: { settings: { count: 4, spacingX: 16, scaleStep: -0.08 } },
    alternate: { settings: { count: 5, layout: "radial", radius: 18 } },
  },
  {
    type: "wave-distortion",
    patch: { settings: { amplitude: 6, frequency: 3 } },
    alternate: { settings: { amplitude: 6, frequency: 3, waveform: "triangle", phase: 90 } },
  },
  {
    type: "shape-grid",
    patch: { settings: { cellSize: 7 } },
    alternate: { settings: { cellSize: 7, shape: "crosses", colorMode: "palette" } },
  },
  { type: "watercolor", alternate: { settings: { washScale: 12, pigment: 1, granulation: 0.9 } } },
  {
    type: "blur",
    patch: { scale: 5, settings: { technique: "progressive" } },
    alternate: { scale: 5, settings: { technique: "progressive", gradientInvert: true } },
  },
];

/** Production render session; decoded PNG assertions run in a separate inspection page. */
export async function newEffectsWitness(forceWebGL: boolean, photo: Asset) {
  const source = createLayer("image", {
    id: "source",
    assetId: photo.id,
    x: 32,
    y: 24,
    width: 64,
    height: 64,
  });
  const assets = { [photo.id]: photo };
  const session = createRenderSession({ forceWebGL, maxBytes: 64 * 1024 * 1024 });
  const render = (
    effects: Effect[],
    scope: "layer" | "composition" | "group" | "masked" = "layer",
  ) => {
    let layers: Layer[] = [
      { ...source, effects: scope === "layer" || scope === "masked" ? effects : [] },
    ];
    if (scope === "group")
      layers = [
        createLayer("group", { id: "group", x: 16, y: 16, width: 96, height: 96, effects }),
        { ...source, parentId: "group", x: 16, y: 8 },
      ];
    if (scope === "masked") {
      layers[0]!.mask = { enabled: true, inverted: false, layerId: "clip" };
      layers.push(
        createLayer("rectangle", {
          id: "clip",
          x: 32,
          y: 24,
          width: 32,
          height: 64,
          radius: 0,
          fill: "#ffffff",
        }),
      );
    }
    const page = createPage({
      id: "page",
      width: 144,
      height: 112,
      background: "transparent",
      layers,
      effects: scope === "composition" ? effects : [],
    });
    return session.withCanvasFrame(page, assets, (canvas) => canvas.toDataURL("image/png"));
  };
  try {
    const baseline = await render([]);
    const variants = [];
    for (const { type, patch, alternate } of treatments) {
      const effect = createEffect(type, { id: "fx", ...patch });
      const project = createProject({
        assets,
        pages: [createPage({ layers: [{ ...source, effects: [effect] }] })],
      });
      const engine = new EditorEngine(project);
      engine.execute({
        type: "updateLayers",
        ids: ["source"],
        patch: { effects: [{ ...effect, opacity: 0.5 }] },
      });
      engine.undo();
      if (engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.opacity !== undefined)
        throw new Error(`${type}: undo failed`);
      engine.redo();
      variants.push({
        type,
        masked: await render([effect], "masked"),
        image: await render([effect]),
        zero: await render([{ ...effect, amount: 0 }]),
        partial: await render([{ ...effect, opacity: 0.5 }]),
        alternate: await render([createEffect(type, alternate)]),
        localized: await render([
          {
            ...effect,
            settings: {
              ...effect.settings,
              domainEnabled: true,
              domainX: 0.25,
              domainY: 0.5,
              domainRadius: 0.25,
              domainFeather: 0.1,
            },
          },
        ]),
        group: await render([effect], "group"),
        groupZero: await render([{ ...effect, amount: 0 }], "group"),
        composition: await render([effect], "composition"),
        compositionZero: await render([{ ...effect, amount: 0 }], "composition"),
      });
    }
    const stack = [
      createEffect("wave-distortion", { settings: { amplitude: 5 } }),
      createEffect("glow", { settings: { radius: 8, threshold: 0.2 } }),
    ];
    const order = [await render(stack), await render([...stack].reverse())];
    const glowCalibration = [];
    for (const radius of [3, 32, 128]) {
      const effect = createEffect("glow", {
        settings: { radius, threshold: 0.1, knee: 0.1, intensity: 3, glowOnly: true },
      });
      const page = createPage({
        width: 144,
        height: 112,
        background: "transparent",
        layers: [
          createLayer("rectangle", {
            x: 66,
            y: 50,
            width: 12,
            height: 12,
            radius: 0,
            fill: "#ffffff",
            effects: [effect],
          }),
        ],
      });
      glowCalibration.push({
        radius,
        image: await session.withCanvasFrame(page, assets, (canvas) =>
          canvas.toDataURL("image/png"),
        ),
      });
    }
    const black = createPage({
      width: 144,
      height: 112,
      background: "transparent",
      layers: [
        createLayer("rectangle", {
          x: 48,
          y: 32,
          width: 48,
          height: 48,
          radius: 0,
          fill: "#000000",
          effects: [createEffect("glow", { settings: { glowOnly: true, radius: 32 } })],
        }),
      ],
    });
    const blackGlow = await session.withCanvasFrame(black, assets, (canvas) =>
      canvas.toDataURL("image/png"),
    );
    const stats = session.stats();
    if (!stats) throw new Error("Native renderer did not publish resource statistics.");
    return { baseline, variants, order, glowCalibration, blackGlow, stats };
  } finally {
    await session.dispose();
  }
}

export async function newEffectsLoad(photo: Asset) {
  const session = createRenderSession({ maxBytes: 64 * 1024 * 1024 });
  try {
    const layers = Array.from({ length: 50 }, (_, i) => {
      const item = treatments[i % treatments.length]!;
      return createLayer("image", {
        id: `load-${i}`,
        assetId: photo.id,
        x: (i % 10) * 32,
        y: Math.floor(i / 10) * 32,
        width: 28,
        height: 28,
        effects: [createEffect(item.type, item.patch)],
      });
    });
    await session.withCanvasFrame(
      createPage({ width: 320, height: 160, layers }),
      { [photo.id]: photo },
      () => {},
    );
    const stats = session.stats();
    if (!stats) throw new Error("Native renderer did not publish resource statistics.");
    return stats;
  } finally {
    await session.dispose();
  }
}
