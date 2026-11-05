import type { DragEvent } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { createPage, createProject, EditorEngine } from "@musart/core";
import { arrangeArtboards } from "../../../src/canvas/artboards/layout";
import { createCanvasTransfers } from "../../../src/canvas/interaction/transfers";
import { useCanvasTransfers } from "../../../src/canvas/interaction/library-drop";
import { beginLibraryDrag, LIBRARY_DRAG_TYPE } from "../../../src/services/assets/library-drag";
import type { LibraryDropTarget } from "../../../src/services/assets/library-drag";
import type { Point } from "../../../src/canvas/viewport/view";

function fixture(allowOutsideActive = false) {
  const engine = new EditorEngine(
    createProject({
      pages: ["a", "b"].map((id) => createPage({ id, width: 200, height: 160 })),
    }),
  );
  const viewport = document.createElement("div");
  const rect = new DOMRect(50, 80, 1000, 600);
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(rect);
  const view = { x: 75, y: -30, zoom: 2 };
  const onFiles = vi.fn(),
    onActive = vi.fn(),
    onError = vi.fn(),
    onLibraryDrop = vi.fn();
  const workspace = () => arrangeArtboards(engine.getSnapshot().project.pages);
  const options = {
    engine,
    readPage: () => engine.getSnapshot().project.pages[0]!,
    readWorkspace: workspace,
    readView: () => view,
    readViewport: () => viewport,
    allowOutsideActive,
    onFiles,
    onActive,
    onError,
    onLibraryDrop,
  };
  const transfers = createCanvasTransfers(options);
  const values = new Map<string, string>();
  const dataTransfer = {
    get types() {
      return [...values.keys()];
    },
    files: [],
    effectAllowed: "none",
    dropEffect: "none",
    getData: (type: string) => values.get(type) ?? "",
    setData: (type: string, value: string) => values.set(type, value),
  } as unknown as DataTransfer;
  function input(pageId: string, point: Point) {
    const world = workspace(),
      board = world.boards.find(({ id }) => id === pageId)!;
    return {
      currentTarget: viewport,
      relatedTarget: null,
      clientX:
        rect.left + rect.width / 2 + view.x + (board.x + point.x - world.width / 2) * view.zoom,
      clientY:
        rect.top + rect.height / 2 + view.y + (board.y + point.y - world.height / 2) * view.zoom,
      dataTransfer,
      preventDefault: vi.fn(),
    } as unknown as DragEvent<HTMLDivElement>;
  }
  return {
    engine,
    options,
    transfers,
    viewport,
    onFiles,
    onActive,
    onError,
    onLibraryDrop,
    dataTransfer,
    input,
  };
}
afterEach(() => window.dispatchEvent(new Event("dragend")));

it("accepts a native library session once, preserves child crossings and places on a zoomed neighboring artboard", async () => {
  const d = fixture(),
    insert = vi.fn((target: LibraryDropTarget) =>
      expect(d.engine.getSnapshot().pageId).toBe(target.pageId),
    );
  beginLibraryDrag({ dataTransfer: d.dataTransfer }, d.engine, insert);
  const event = d.input("b", { x: 40, y: 35 });
  expect(d.transfers.onDragOver(event)).toBe(true);
  for (let frame = 0; frame < 20; frame++) d.transfers.onDragOver(event);
  expect(d.onActive.mock.calls).toEqual([[true]]);
  expect(d.dataTransfer.dropEffect).toBe("copy");
  const child = document.createElement("span");
  d.viewport.append(child);
  d.transfers.onDragLeave({ ...event, relatedTarget: child });
  expect(d.onActive).toHaveBeenCalledTimes(1);
  d.transfers.onDragLeave(event);
  d.transfers.onDragOver(event);
  expect(d.transfers.onDrop(event)).toBe(true);
  expect(d.engine.getSnapshot().pageId).toBe("b");
  await Promise.resolve();
  expect(insert).toHaveBeenCalledWith(
    expect.objectContaining({ pageId: "b", point: { x: 40, y: 35 } }),
  );
  expect(d.onActive.mock.calls).toEqual([[true], [false], [true], [false]]);
  expect(event.preventDefault).toHaveBeenCalled();
  expect(d.onFiles).not.toHaveBeenCalled();
  expect(d.onLibraryDrop).toHaveBeenCalledOnce();
});

it.each([false, true])(
  "uses active composition space outside the frame only in Studio (%s)",
  async (studio) => {
    const d = fixture(studio),
      insert = vi.fn();
    beginLibraryDrag({ dataTransfer: d.dataTransfer }, d.engine, insert);
    d.transfers.onDrop(d.input("a", { x: -80, y: 210 }));
    await Promise.resolve();
    if (studio)
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ pageId: "a", point: { x: -80, y: 210 } }),
      );
    else expect(insert).not.toHaveBeenCalled();
    expect(d.engine.getSnapshot().pageId).toBe("a");
    expect(d.onLibraryDrop).toHaveBeenCalledTimes(studio ? 1 : 0);
  },
);

it("leaves unrelated native drags untouched and delegates file imports to their destination", () => {
  const d = fixture(),
    event = d.input("b", { x: 40, y: 35 });
  for (const type of ["application/x-musart-layer", "text/plain", LIBRARY_DRAG_TYPE]) {
    const unrelated = {
      ...event,
      dataTransfer: { types: [type], files: [] },
    } as unknown as DragEvent<HTMLDivElement>;
    expect(d.transfers.onDragOver(unrelated)).toBe(false);
    expect(d.transfers.onDragLeave(unrelated)).toBe(false);
    expect(d.transfers.onDrop(unrelated)).toBe(false);
  }
  expect(d.onActive).not.toHaveBeenCalled();
  expect(event.preventDefault).not.toHaveBeenCalled();
  const file = new File(["image"], "image.png", { type: "image/png" });
  d.transfers.onDrop({
    ...event,
    dataTransfer: { types: ["Files"], files: [file] },
  } as unknown as DragEvent<HTMLDivElement>);
  expect(d.engine.getSnapshot().pageId).toBe("b");
  expect(d.onFiles).toHaveBeenCalledWith([file]);
});

it("reports actual library insertion failures through the canvas error callback", async () => {
  const d = fixture();
  beginLibraryDrag({ dataTransfer: d.dataTransfer }, d.engine, () => {
    throw new Error("Model unavailable");
  });
  d.transfers.onDrop(d.input("a", { x: 30, y: 20 }));
  await Promise.resolve();
  await Promise.resolve();
  expect(d.onError).toHaveBeenCalledWith("Model unavailable");
});

it("keeps handlers across callback changes, clears native cancellation and cancels pending work on unmount", async () => {
  const d = fixture();
  const hook = renderHook(({ onFiles }) => useCanvasTransfers({ ...d.options, onFiles }), {
    initialProps: { onFiles: d.onFiles },
  });
  const handlers = hook.result.current;
  const insert = vi.fn();
  beginLibraryDrag({ dataTransfer: d.dataTransfer }, d.engine, insert);
  act(() => {
    handlers.onDragOver(d.input("a", { x: 30, y: 20 }));
  });
  hook.rerender({ onFiles: vi.fn() });
  expect(hook.result.current).toBe(handlers);
  act(() => {
    window.dispatchEvent(new Event("dragend"));
  });
  expect(d.onActive.mock.calls).toEqual([[true], [false]]);

  beginLibraryDrag({ dataTransfer: d.dataTransfer }, d.engine, insert);
  act(() => {
    handlers.onDrop(d.input("a", { x: 30, y: 20 }));
  });
  hook.rerender({ onFiles: vi.fn() });
  await Promise.resolve();
  expect(insert).toHaveBeenCalledOnce();
  const target = insert.mock.calls[0]![0] as LibraryDropTarget;
  hook.unmount();
  expect(target.signal.aborted).toBe(true);
  expect(d.onError).not.toHaveBeenCalled();
});
