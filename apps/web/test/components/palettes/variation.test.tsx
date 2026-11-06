import { expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { usePaletteVariation } from "../../../src/components/palettes/use-palette-variation";
import { previewAtom } from "../../../src/state/session/editor";
function setup() {
  const engine = new EditorEngine(
    createProject({
      colors: [{ id: "brand", name: "Brand", value: "#a64433" }],
      pages: [
        createPage({
          id: "page",
          layers: [
            createLayer("rectangle", {
              id: "linked",
              fill: "#a64433",
              colorLinks: { fill: "brand" },
            }),
          ],
        }),
      ],
    }),
  );
  const store = createStore(),
    callbacks = { beforeApply: vi.fn(), onUse: vi.fn(), onPreview: vi.fn(), onCancel: vi.fn() },
    invalidated = vi.fn();
  const hook = renderHook(() => usePaletteVariation(engine, callbacks, invalidated), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    ),
  });
  return { engine, store, callbacks, invalidated, ...hook };
}
const colors = [{ id: "brand", name: "Brand", value: "#336688" }];
it("holds artwork previews outside document history, cancels exactly and applies all globals as one undo", () => {
  const { engine, store, result } = setup(),
    before = engine.getSnapshot();
  act(() => result.current.preview(colors));
  expect(store.get(previewAtom)).toMatchObject({
    target: "page",
    patch: { layers: [{ fill: "#336688" }] },
  });
  expect(engine.getSnapshot()).toBe(before);
  act(() => result.current.cancel());
  expect(store.get(previewAtom)).toBeNull();
  expect(engine.getSnapshot()).toBe(before);
  act(() => {
    result.current.preview(colors);
    result.current.apply(colors);
  });
  expect(store.get(previewAtom)).toBeNull();
  expect(engine.getSnapshot().revision).toBe(before.revision + 1);
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.fill).toBe("#336688");
  act(() => engine.undo());
  expect(engine.getSnapshot().project).toEqual(before.project);
});
it("removes its preview on document changes and unmount without clearing another owner's preview", () => {
  const { engine, store, result, invalidated, unmount } = setup();
  act(() => result.current.preview(colors));
  act(() => engine.execute({ type: "renameProject", name: "Changed" }));
  expect(store.get(previewAtom)).toBeNull();
  expect(invalidated).toHaveBeenCalledOnce();
  act(() => result.current.preview(colors));
  const other = { target: "layer" as const, layerId: "linked", patch: { opacity: 0.3 } };
  store.set(previewAtom, other);
  unmount();
  expect(store.get(previewAtom)).toBe(other);
});
it("previews unlinked palettes through leaf callbacks and restores local appearance on cancel", () => {
  const { result, callbacks, engine } = setup(),
    before = engine.getSnapshot();
  const local = [{ id: "unlinked", name: "Local", value: "#556677" }];
  act(() => result.current.preview(local));
  expect(callbacks.onPreview).toHaveBeenCalledWith("#556677");
  expect(engine.getSnapshot()).toBe(before);
  act(() => result.current.cancel());
  expect(callbacks.onCancel).toHaveBeenCalledOnce();
});
