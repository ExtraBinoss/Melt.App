import type { DragEvent } from "react";
import type { EnginePort } from "@musart/core";
import type { Point } from "../../canvas/viewport/view";

export const LIBRARY_DRAG_TYPE = "application/x-melt-library-item";
export interface LibraryDropTarget {
  readonly pageId: string;
  readonly point: Point;
  readonly signal: AbortSignal;
  assertCurrent(): void;
}
type Insert = (target: LibraryDropTarget) => void | Promise<void>;
let active: { token: string; engine: EnginePort; projectId: string; insert: Insert; dispose(): void } | null = null;
let pending: AbortController | null = null;

/** A bounded, same-session transfer: no models, originals or executable data in DataTransfer. */
export function beginLibraryDrag(event: Pick<DragEvent, "dataTransfer">, engine: EnginePort, insert: Insert) {
  active?.dispose();
  const token = crypto.randomUUID();
  const end = () => {
    window.removeEventListener("dragend", end);
    window.removeEventListener("drop", end);
    if (active?.token === token) active = null;
  };
  active = { token, engine, projectId: engine.getSnapshot().project.id, insert, dispose: end };
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(LIBRARY_DRAG_TYPE, token);
  window.addEventListener("dragend", end, { once: true });
  window.addEventListener("drop", end, { once: true });
}

export function acceptsLibraryDrag(data: Pick<DataTransfer, "types">, engine: EnginePort) {
  return Boolean(active && active.engine === engine && active.projectId === engine.getSnapshot().project.id && Array.from(data.types).includes(LIBRARY_DRAG_TYPE));
}

export function dropLibraryItem(
  data: DataTransfer,
  engine: EnginePort,
  target: { pageId: string; point: Point },
  onError: (error: unknown) => void,
) {
  const item = active;
  if (!item || !acceptsLibraryDrag(data, engine) || data.getData(LIBRARY_DRAG_TYPE) !== item.token) return false;
  item.dispose();
  if (!engine.getSnapshot().project.pages.some(page => page.id === target.pageId)) return false;
  pending?.abort();
  const controller = new AbortController();
  pending = controller;
  engine.setPage(target.pageId);
  const origin = engine.getSnapshot();
  const stop = engine.subscribe(() => {
    const current = engine.getSnapshot();
    if (current.project.id !== origin.project.id || current.pageId !== origin.pageId) controller.abort();
  });
  const assertCurrent = () => {
    controller.signal.throwIfAborted();
    const current = engine.getSnapshot();
    if (current.project.id !== origin.project.id || current.pageId !== origin.pageId || current.revision !== origin.revision)
      throw new DOMException("Composition changed during library drop", "AbortError");
  };
  void Promise.resolve().then(() => {
    assertCurrent();
    return item.insert({ ...target, signal: controller.signal, assertCurrent });
  }).catch(error => {
    if (!controller.signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) onError(error);
  }).finally(() => {
    stop();
    if (pending === controller) pending = null;
  });
  return true;
}
