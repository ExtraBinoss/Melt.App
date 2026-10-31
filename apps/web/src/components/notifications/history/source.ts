import {
  createLayerGeometryIndex,
  type Command,
  type CommandCommitInfo,
  type EnginePort,
  type Layer,
  type SessionSnapshot,
} from "@musart/core";
export type HistoryAction =
  | "edit"
  | "transform"
  | "color"
  | "stroke"
  | "points"
  | "typography"
  | "opacity"
  | "effects"
  | "addLayers"
  | "deleteLayers"
  | "duplicateLayers"
  | "reorderLayer"
  | "groupLayers"
  | "ungroupLayers"
  | "artboard"
  | "renameProject"
  | "guides"
  | "mask"
  | "motion";
export interface HistoryDescription {
  action: HistoryAction;
  before?: string;
  after?: string;
}
export interface HistoryNoticeValue extends HistoryDescription {
  direction: "undo" | "redo";
  id: number;
}
interface SummaryEngine extends EnginePort {
  subscribeCommitInfo(listener: (event: CommandCommitInfo) => void): () => void;
}
const commandActions: Partial<Record<Command["type"], HistoryAction>> = {
  addLayers: "addLayers",
  deleteLayers: "deleteLayers",
  duplicateLayers: "duplicateLayers",
  reorderLayer: "reorderLayer",
  groupLayers: "groupLayers",
  ungroupLayers: "ungroupLayers",
  addPage: "artboard",
  updatePage: "artboard",
  deletePage: "artboard",
  renameProject: "renameProject",
  addGuide: "guides",
  updateGuide: "guides",
  deleteGuide: "guides",
  alignLayers: "transform",
  distributeLayers: "transform",
  attachLayerMask: "mask",
  createMaskFromSelection: "mask",
  updateMask: "mask",
  removeLayerMask: "mask",
};
const fieldActions: Partial<Record<keyof Layer, HistoryAction>> = {
  x: "transform",
  y: "transform",
  width: "transform",
  height: "transform",
  rotation: "transform",
  scaleX: "transform",
  scaleY: "transform",
  fill: "color",
  stroke: "stroke",
  strokeWidth: "stroke",
  vector: "points",
  effects: "effects",
  opacity: "opacity",
  text: "typography",
  fontFamily: "typography",
  fontSize: "typography",
  fontWeight: "typography",
  lineHeight: "typography",
  letterSpacing: "typography",
  textAlign: "typography",
};
/** Field metadata classifies completed edits without diffing SVG paths or effect stacks. */
export function describeHistory(
  types: readonly Command["type"][],
  before: SessionSnapshot,
  after: SessionSnapshot,
  fields: readonly (keyof Layer)[] = [],
): HistoryDescription {
  const categories = new Set(
    types.flatMap((type) => (commandActions[type] ? [commandActions[type]!] : [])),
  );
  for (const field of fields) categories.add(fieldActions[field] ?? "edit");
  if (
    types.some(
      (type) => type !== "updateLayers" && type !== "updateLayerPatches" && !commandActions[type],
    )
  )
    categories.add(
      types.some((type) => /Motion|Keyframe|Transition/.test(type)) ? "motion" : "edit",
    );
  const action = categories.size === 1 ? [...categories][0]! : "edit";
  if (action !== "color" && action !== "opacity") return { action };
  const page = after.project.pages.find((page) => page.id === after.pageId),
    previous = before.project.pages.find((item) => item.id === page?.id);
  if (!page || !previous) return { action };
  const index = createLayerGeometryIndex(previous),
    oldValues = new Set<string>(),
    newValues = new Set<string>();
  for (const layer of page.layers) {
    const old = index.byId.get(layer.id);
    if (!old) continue;
    if (action === "color" && old.fill !== layer.fill) {
      oldValues.add(old.fill.slice(0, 80));
      newValues.add(layer.fill.slice(0, 80));
    } else if (action === "opacity" && old.opacity !== layer.opacity) {
      oldValues.add(`${Math.round(old.opacity * 100)}%`);
      newValues.add(`${Math.round(layer.opacity * 100)}%`);
    }
  }
  return {
    action,
    ...(oldValues.size === 1 ? { before: [...oldValues][0] } : {}),
    ...(newValues.size === 1 ? { after: [...newValues][0] } : {}),
  };
}
export function observeHistoryNotices(
  engine: EnginePort,
  publish: (notice: HistoryNoticeValue | null) => void,
): () => void {
  if (!("subscribeCommitInfo" in engine) || typeof engine.subscribeCommitInfo !== "function")
    return () => {};
  const past: HistoryDescription[] = [],
    future: HistoryDescription[] = [];
  let previous = engine.getSnapshot(),
    sequence = 0;
  const stop = (engine as SummaryEngine).subscribeCommitInfo((event) => {
    const after = event.snapshot;
    if (event.kind === "load" || after.project.id !== previous.project.id) {
      past.length = future.length = 0;
      publish(null);
    } else if (event.kind === "commit") {
      past.push(describeHistory(event.types, previous, after, event.layerFields));
      if (past.length > 100) past.shift();
      future.length = 0;
    } else {
      const description = (event.kind === "undo" ? past : future).pop() ?? {
        action: "edit" as const,
      };
      (event.kind === "undo" ? future : past).push(description);
      publish({ ...description, direction: event.kind, id: ++sequence });
    }
    if (!after.canUndo) past.length = 0;
    if (!after.canRedo) future.length = 0;
    previous = after;
  });
  return () => {
    stop();
    past.length = future.length = 0;
  };
}
