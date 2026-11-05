import { backgroundLayer, createLayer, type EnginePort } from "@musart/core";

export { backgroundLayer } from "@musart/core";

/** Preserve the existing paint exactly and make it effect-editable in one undo transaction. */
export function createBackgroundLayer(engine: EnginePort, name: string) {
  const snapshot = engine.getSnapshot();
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const existing = backgroundLayer(page);
  if (existing) return existing;
  const layer = createLayer("rectangle", {
    id: crypto.randomUUID(),
    name,
    x: 0,
    y: 0,
    width: page.width,
    height: page.height,
    fill: page.background,
    background: true,
    ...(page.backgroundGradient ? { fillGradient: structuredClone(page.backgroundGradient) } : {}),
  });
  engine.transaction([
    { type: "addLayers", layers: [layer] },
    { type: "reorderLayer", id: layer.id, index: 0, parentId: null },
    { type: "updatePage", patch: { background: "#00000000", backgroundGradient: undefined } },
  ]);
  engine.select([...snapshot.selection]);
  return layer;
}
