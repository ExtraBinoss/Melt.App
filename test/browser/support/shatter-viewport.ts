import { createEffect, createLayer, createPage } from "../../../packages/core/src/index";
import { createRenderSession } from "../../../packages/render/src/index";

/** Exercise the same windowed transport used by native canvas pan/zoom, with real GPU pixels. */
export async function captureShatterViewport(forceWebGL: boolean) {
  const session = createRenderSession({ forceWebGL, maxBytes: 32 * 1024 * 1024 });
  const frames = [];
  try {
    for (const owner of ["composition", "background"] as const)
      for (const pattern of ["impact", "cellular"] as const) {
        const effect = createEffect("shatter", {
          scale: 24,
          seed: 1073741825,
          settings: {
            pattern,
            centerX: 0.37,
            centerY: 0.61,
            radius: 0.8,
            crackWidth: 3,
            cutout: true,
            roughness: 0,
            displacement: 0,
            rotation: 0,
            thickness: 0,
          },
        });
        const page = createPage({
          width: 128,
          height: 128,
          background: "transparent",
          layers: [
            createLayer("rectangle", {
              id: "glass-background",
              name: "Arrière-plan",
              x: 0,
              y: 0,
              width: 128,
              height: 128,
              fill: "#8297ab",
              fillGradient: {
                kind: "linear",
                angle: 27,
                stops: [
                  { offset: 0, color: "#eab281" },
                  { offset: 1, color: "#3857b8" },
                ],
              },
              ...(owner === "background" ? { effects: [effect] } : {}),
            }),
          ],
          ...(owner === "composition" ? { effects: [effect] } : {}),
        });
        for (const scale of [1, 2]) {
          const reference = await session.withCanvasFrame(
            page,
            {},
            (canvas) => canvas.toDataURL(),
            {
              scale,
            },
          );
          for (const viewport of [
            { x: -64, y: -64, width: 256, height: 256 },
            { x: -128, y: -32, width: 384, height: 192 },
            { x: 32, y: 32, width: 64, height: 64 },
          ]) {
            const candidate = await session.withCanvasFrame(
              page,
              {},
              (canvas) => canvas.toDataURL(),
              { scale, viewport },
            );
            frames.push({ owner, pattern, scale, viewport, reference, candidate });
          }
        }
      }
    return { frames, stats: session.stats(), reads: window.__musartVideoReadbacks };
  } finally {
    await session.dispose();
  }
}
