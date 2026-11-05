import type { Composition, EnginePort } from "@musart/core";
import type { DragEvent } from "react";
import { acceptsLibraryDrag, dropLibraryItem } from "../../services/assets/library-drag";
import { artboardAt, type ArtboardWorkspace } from "../artboards/layout";
import { canvasHit } from "../selection/hit";
import { clientToPage, type Point, type View } from "../viewport/view";
import { createCanvasFileDropHandlers } from "./file-drop";

export interface CanvasContextTarget {
  readonly compositionId: string;
  readonly layerId: string;
  readonly locked: boolean;
}
export interface CanvasTransfersOptions {
  readonly engine: EnginePort;
  readonly readPage: () => Composition;
  readonly readWorkspace: () => ArtboardWorkspace;
  readonly readView: () => View;
  readonly readViewport: () => HTMLElement | null;
  readonly onActive: (active: boolean) => void;
  readonly onFiles?: (files: File[]) => void;
  readonly onError?: (message: string) => void;
  readonly onLibraryDrop?: () => void;
  readonly allowOutsideActive?: boolean;
}
/** Native transfer and context targets share the actual world/artboard coordinate conversion. */
export function createCanvasTransfers(options: CanvasTransfersOptions) {
  let active = false;
  function onActive(next: boolean) {
    if (active === next) return;
    active = next;
    options.onActive(next);
  }
  function locate(point: Point, element = options.readViewport(), allowOutside = false) {
    if (!element) return null;
    const world = options.readWorkspace();
    const position = clientToPage(
      point,
      element.getBoundingClientRect(),
      options.readView(),
      world,
    );
    const board =
      artboardAt(world, position) ??
      (allowOutside
        ? world.boards.find(({ id }) => id === options.engine.getSnapshot().pageId)
        : undefined);
    return board ? { board, position: { x: position.x - board.x, y: position.y - board.y } } : null;
  }
  const files = createCanvasFileDropHandlers({
    onActive,
    onFiles(event, files) {
      const located = locate({ x: event.clientX, y: event.clientY }, event.currentTarget);
      if (located) options.engine.setPage(located.board.id);
      options.onFiles?.(files);
    },
  });
  const accepts = (event: DragEvent<HTMLDivElement>) =>
    Boolean(event.dataTransfer && acceptsLibraryDrag(event.dataTransfer, options.engine));
  return {
    reset: () => onActive(false),
    target(this: void, point: Point): CanvasContextTarget | null {
      const located = locate(point);
      if (!located) return null;
      const presented = options.readPage();
      const page =
        presented.id === located.board.id
          ? presented
          : options.engine.getSnapshot().project.pages.find(({ id }) => id === located.board.id);
      const hit = page && canvasHit(page, located.position, true);
      return hit
        ? { compositionId: located.board.id, layerId: hit.layer.id, locked: hit.locked }
        : null;
    },
    files,
    onDragOver(this: void, event: DragEvent<HTMLDivElement>) {
      if (!accepts(event)) {
        files.onDragOver(event);
        return false;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      onActive(true);
      return true;
    },
    onDragLeave(this: void, event: DragEvent<HTMLDivElement>) {
      if (!accepts(event)) {
        files.onDragLeave(event);
        return false;
      }
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onActive(false);
      return true;
    },
    onDrop(this: void, event: DragEvent<HTMLDivElement>) {
      if (!accepts(event)) {
        files.onDrop(event);
        return false;
      }
      event.preventDefault();
      onActive(false);
      const located = locate(
        { x: event.clientX, y: event.clientY },
        event.currentTarget,
        options.allowOutsideActive,
      );
      if (
        located &&
        dropLibraryItem(
          event.dataTransfer,
          options.engine,
          { pageId: located.board.id, point: located.position },
          (error) => options.onError?.(error instanceof Error ? error.message : String(error)),
        )
      )
        options.onLibraryDrop?.();
      return true;
    },
  };
}
