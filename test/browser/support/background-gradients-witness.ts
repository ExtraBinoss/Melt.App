import { createPage, type FillGradient } from "../../../packages/core/src/index";
import { createRenderSession } from "../../../packages/render/src/index";
export async function runBackgroundGradients(forceWebGL: boolean) {
  const session = createRenderSession({ forceWebGL, maxBytes: 16 * 1024 * 1024 });
  const paint: FillGradient = {
    kind: "linear",
    angle: 0,
    stops: [
      { offset: 0, color: "#ff0000" },
      { offset: 1, color: "#0000ff" },
    ],
  };
  const page = createPage({
    id: "paint",
    width: 64,
    height: 32,
    background: "#00ff00",
    backgroundGradient: paint,
  });
  const render = (backgroundGradient: FillGradient | undefined) =>
    session.withCanvasFrame({ ...page, backgroundGradient }, {}, (canvas) =>
      canvas.toDataURL("image/png"),
    );
  try {
    return {
      horizontal: await render(paint),
      vertical: await render({ ...paint, angle: 90 }),
      radial: await render({ ...paint, kind: "radial" }),
      alpha: await render({
        ...paint,
        stops: [
          { offset: 0, color: "#ff000080" },
          { offset: 1, color: "#ff000080" },
        ],
      }),
      solid: await render(undefined),
      restored: await render(paint),
      stats: session.stats(),
    };
  } finally {
    await session.dispose();
  }
}
