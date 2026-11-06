import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  type Asset,
  type Effect,
  type Layer,
} from "../../../packages/core/src/index";
import { createRenderSession } from "../../../packages/render/src/index";

const treatments = [
  { type: "wax", alternate: { settings: { blur: 9, relief: 2, translucence: 0.9, tint: 0.7 } } },
  { type: "melt", alternate: { settings: { distance: 28, angle: 0, phase: 180, liquidity: 0.9 } } },
  { type: "emboss", alternate: { settings: { mode: "recessed", depth: 8, material: "neutral" } } },
] as const;

/** Uses the production renderer; only the separate inspection page decodes export pixels. */
export async function materialTreatmentWitness(forceWebGL: boolean, photo: Asset) {
  const session = createRenderSession({ forceWebGL, maxBytes: 64 * 1024 * 1024 });
  const assets = { [photo.id]: photo };
  const source = createLayer("image", {
    id: "source",
    assetId: photo.id,
    x: 32,
    y: 24,
    width: 64,
    height: 64,
  });
  const render = (effects: Effect[], scope = "layer", calibration = false) => {
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
    if (calibration)
      layers = [
        createLayer("rectangle", {
          id: "stamp",
          x: 48,
          y: 28,
          width: 40,
          height: 40,
          radius: 8,
          fill: "#bd704d",
          effects,
        }),
      ];
    return session.withCanvasFrame(
      createPage({
        width: 144,
        height: 112,
        background: "transparent",
        layers,
        effects: scope === "composition" ? effects : [],
      }),
      assets,
      (canvas) => canvas.toDataURL("image/png"),
    );
  };
  try {
    const baseline = await render([]),
      variants = [];
    for (const { type, alternate } of treatments) {
      const effect = createEffect(type, { id: "fx" });
      const engine = new EditorEngine(
        createProject({
          assets,
          pages: [createPage({ layers: [{ ...source, effects: [effect] }] })],
        }),
      );
      engine.execute({
        type: "updateLayers",
        ids: ["source"],
        patch: { effects: [{ ...effect, opacity: 0.5 }] },
      });
      engine.undo();
      if (engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.opacity !== undefined)
        throw new Error(`${type}: undo failed`);
      engine.redo();
      if (engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.opacity !== 0.5)
        throw new Error(`${type}: redo failed`);
      variants.push({
        type,
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
        masked: await render([effect], "masked"),
        group: await render([effect], "group"),
        groupZero: await render([{ ...effect, amount: 0 }], "group"),
        composition: await render([effect], "composition"),
        compositionZero: await render([{ ...effect, amount: 0 }], "composition"),
      });
    }
    const stamp = await render([], "layer", true);
    const embossModes = [];
    for (const mode of ["raised", "recessed", "pillow", "outline"])
      embossModes.push({
        mode,
        image: await render(
          [
            createEffect("emboss", {
              settings: { mode, height: "alpha", material: "neutral", size: 5, depth: 6 },
            }),
          ],
          "layer",
          true,
        ),
      });
    const waxStamp = await render([createEffect("wax")], "layer", true);
    const meltStamp = await render(
      [
        createEffect("melt", {
          settings: { distance: 25, angle: 90, toneInfluence: 0, liquidity: 0.8, dripScale: 12 },
        }),
      ],
      "layer",
      true,
    );
    const meltHorizontal = await render(
      [
        createEffect("melt", {
          settings: { distance: 25, angle: 0, toneInfluence: 0, liquidity: 0.8, dripScale: 12 },
        }),
      ],
      "layer",
      true,
    );
    const meltPhase = await render(
      [
        createEffect("melt", {
          settings: {
            distance: 25,
            angle: 90,
            toneInfluence: 0,
            liquidity: 0.8,
            dripScale: 12,
            phase: 145,
          },
        }),
      ],
      "layer",
      true,
    );
    const meltRepeat = await render(
      [
        createEffect("melt", {
          settings: { distance: 25, angle: 90, toneInfluence: 0, liquidity: 0.8, dripScale: 12 },
        }),
      ],
      "layer",
      true,
    );
    const order = [
      await render([createEffect("melt"), createEffect("emboss")]),
      await render([createEffect("emboss"), createEffect("melt")]),
    ];
    const stats = session.stats();
    if (!stats) throw new Error("Native renderer statistics unavailable");
    return {
      baseline,
      variants,
      stamp,
      waxStamp,
      embossModes,
      meltStamp,
      meltHorizontal,
      meltPhase,
      meltRepeat,
      order,
      stats,
    };
  } finally {
    await session.dispose();
  }
}

export async function materialTreatmentLoad(photo: Asset) {
  const session = createRenderSession({ maxBytes: 64 * 1024 * 1024 });
  try {
    const layers = Array.from({ length: 50 }, (_, i) =>
      createLayer("image", {
        id: `material-${i}`,
        assetId: photo.id,
        x: (i % 10) * 32,
        y: Math.floor(i / 10) * 32,
        width: 28,
        height: 28,
        effects: [createEffect(treatments[i % treatments.length]!.type)],
      }),
    );
    await session.withCanvasFrame(
      createPage({ width: 320, height: 160, layers }),
      { [photo.id]: photo },
      () => {},
    );
    const stats = session.stats();
    if (!stats) throw new Error("Native renderer statistics unavailable");
    return stats;
  } finally {
    await session.dispose();
  }
}
