import { createLayer, type Composition, type EnginePort } from "@musart/core";

/** An ordinary full-frame first layer, never a separate background rendering pipeline. */
export function backgroundLayer(page: Composition) {
  const first = page.layers.find((layer) => !layer.parentId);
  return first?.kind === "rectangle" &&
    !first.spatial?.enabled &&
    first.x === 0 &&
    first.y === 0 &&
    first.width === page.width &&
    first.height === page.height &&
    first.rotation === 0 &&
    (first.scaleX ?? 1) === 1 &&
    (first.scaleY ?? 1) === 1 &&
    !first.affine
    ? first
    : undefined;
}

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
