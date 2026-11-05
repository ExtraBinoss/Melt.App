import {
  createEffect,
  createLayer,
  createPage,
  type Effect,
} from "../../../packages/core/src/index";
import { createRenderSession } from "../../../packages/render/src/index";

/** Coordinate-sensitive witnesses keep source availability separate from authored field anchoring. */
const effects: readonly Effect[] = [
  createEffect("grain", { scale: 3, amount: 0.8 }),
  createEffect("noise", { scale: 17 }),
  createEffect("flashlight", { settings: { centerX: 0.37, centerY: 0.61, grain: 0.2 } }),
  createEffect("cyanotype", { settings: { paperGrain: 0.2, fibers: 0.2 } }),
  createEffect("pink-phosphor", { settings: { glow: 0, grain: 0.1 } }),
  createEffect("thermal", { settings: { grain: 0.2, scanlines: 0.5 } }),
  createEffect("vignette", { scale: 2 }),
  createEffect("feather", { settings: { centerX: 0.37, centerY: 0.61, radius: 0.4 } }),
  createEffect("terminal", { settings: { progress: 0.43 } }),
  createEffect("circle", { settings: { spacing: 17 } }),
  createEffect("bit-dither", { scale: 3 }),
  createEffect("ascii", { scale: 8 }),
  createEffect("dither", { scale: 3 }),
  createEffect("halftone", { scale: 7 }),
  createEffect("crt", {
    scale: 3,
    settings: { curvatureX: 0, curvatureY: 0, convergence: 0, glow: 0, jitter: 0, noise: 0.1 },
  }),
  createEffect("receipt", { scale: 3, settings: { foldStrength: 0.6, foldPosition: 0.4 } }),
  createEffect("window-trails", {
    time: 1,
    settings: {
      width: 48,
      height: 40,
      count: 6,
      centerX: 0.37,
      centerY: 0.61,
      radiusX: 0.25,
      radiusY: 0.2,
      entranceDelay: 0,
    },
  }),
  createEffect("transition", { settings: { style: "dissolve", progress: 0.43 } }),
  ...(["none", "blocks", "glass", "folds"] as const).map((treatment) =>
    createEffect("gradient", {
      settings: {
        preset: "custom",
        treatment,
        size: 17,
        grain: 0.2,
        frost: 0.2,
        refraction: 0,
        blur: 0,
        dispersion: 0,
      },
    }),
  ),
  createEffect("ripple", {
    settings: {
      centerX: 0.37,
      centerY: 0.61,
      innerRadius: 0,
      radius: 44,
      feather: 6,
      amplitude: 3,
      wavelength: 12,
    },
  }),
  createEffect("datamosh", { settings: { displacement: 4, chromaShift: 1, blockSize: 17 } }),
  createEffect("pixel-sort", { settings: { cellSize: 1 } }),
];

export async function captureEffectViewport(forceWebGL: boolean, names?: readonly string[]) {
  const session = createRenderSession({ forceWebGL, maxBytes: 32 * 1024 * 1024 });
  const frames = [];
  const viewport = { x: -37, y: -23, width: 223, height: 191 };
  try {
    for (const effect of effects.filter(
      (effect) =>
        !names?.length ||
        names.includes(
          effect.type + (effect.type === "gradient" ? `-${effect.settings?.treatment}` : ""),
        ),
    ))
      for (const owner of ["composition", "background"] as const) {
        const photographic = ["ripple", "datamosh", "pixel-sort"].includes(effect.type);
        const page = createPage({
          width: 128,
          height: 128,
          background: "transparent",
          layers: [
            createLayer("rectangle", {
              id: "background",
              name: "Arrière-plan",
              x: 0,
              y: 0,
              width: 128,
              height: 128,
              fill: "#8297ab",
              ...(photographic
                ? {
                    fillGradient: {
                      kind: "linear" as const,
                      angle: 27,
                      stops: [
                        { offset: 0, color: "#eab281" },
                        { offset: 1, color: "#3857b8" },
                      ],
                    },
                  }
                : {}),
              ...(owner === "background" ? { effects: [effect] } : {}),
            }),
          ],
          ...(owner === "composition" ? { effects: [effect] } : {}),
        });
        const reference = await session.withCanvasFrame(page, {}, (canvas) => canvas.toDataURL());
        const candidate = await session.withCanvasFrame(page, {}, (canvas) => canvas.toDataURL(), {
          viewport,
        });
        frames.push({
          name: effect.type + (effect.type === "gradient" ? `-${effect.settings?.treatment}` : ""),
          owner,
          scale: 1,
          viewport,
          reference,
          candidate,
        });
      }
    return { frames, stats: session.stats(), reads: window.__musartVideoReadbacks };
  } finally {
    await session.dispose();
  }
}
