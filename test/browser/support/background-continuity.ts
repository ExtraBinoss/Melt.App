import { createLayer, createPage, createEffect } from "../../../packages/core/src/index";
import { createRenderSession } from "../../../packages/render/src/index";

export async function captureBackgroundContinuity(forceWebGL: boolean) {
  const session = createRenderSession({ forceWebGL, maxBytes: 32 * 1024 * 1024 });
  const underlay = {
    kind: "linear" as const,
    angle: 90,
    stops: [
      { offset: 0, color: "#CCBBDD" },
      { offset: 1, color: "#6F40CB" },
    ],
  };
  const layer = createLayer("rectangle", {
    id: "legacy-background",
    name: "Arrière-plan",
    x: 10,
    y: 8,
    width: 80,
    height: 48,
    fill: "#24272C",
  });
  const page = createPage({
    id: "background",
    width: 128,
    height: 80,
    background: "#CCBBDD",
    backgroundGradient: underlay,
    layers: [layer],
  });
  const capture = (next: typeof layer, expanded: boolean) =>
    session.withCanvasFrame(
      { ...page, layers: [next] },
      {},
      (canvas) => canvas.toDataURL(),
      expanded ? { viewport: { x: -32, y: -20, width: 192, height: 120 } } : {},
    );
  try {
    const results = [];
    for (const expanded of [false, true]) {
      const solid = await capture(layer, expanded);
      const resized = await capture({ ...layer, x: 30, width: 40, height: 32 }, expanded);
      const gradient = await capture(
        {
          ...layer,
          fillGradient: {
            ...underlay,
            angle: 0,
            stops: [
              { offset: 0, color: "#24272C" },
              { offset: 1, color: "#CCCCCC" },
            ],
          },
        },
        expanded,
      );
      const transparent = await capture({ ...layer, fill: "#00000000" }, expanded);
      const effects = [
        createEffect("grain", { amount: 0.06 }),
        createEffect("feather", { amount: 0.5 }),
      ];
      const effectful = await capture({ ...layer, effects }, expanded);
      const effectsTransparent = await capture({ ...layer, fill: "#00000000", effects }, expanded);
      const restored = await capture(layer, expanded);
      const ordinary = await capture({ ...layer, background: false }, expanded);
      results.push({
        expanded,
        solid,
        resized,
        gradient,
        transparent,
        effectful,
        effectsTransparent,
        restored,
        ordinary,
      });
    }
    return { results, reads: window.__musartVideoReadbacks, stats: session.stats() };
  } finally {
    await session.dispose();
  }
}
