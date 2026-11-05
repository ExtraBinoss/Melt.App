import { expect, test, vi } from "vitest";
import {
  BACKGROUND_PRESETS,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
} from "@musart/core";
import type { PreviewValue } from "../../../src/state/session/preview-source";
import { createBackgroundRecipePreview } from "../../../src/ui/studio/background/preview";
const recipe = BACKGROUND_PRESETS.find((item) => item.category === "atmosphere")!;
function fixture() {
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ layers: [createLayer("text", { id: "fg" })] })] }),
  );
  let preview: PreviewValue | null = null;
  const write = vi.fn((next: PreviewValue | null) => {
    preview = next;
  });
  let timeListener = () => {};
  const release = vi.fn();
  const draft = createBackgroundRecipePreview(
    engine,
    { read: () => preview, write },
    {
      read: () => null,
      subscribe: (listener) => {
        timeListener = listener;
        return release;
      },
    },
  );
  const stop = draft.start();
  return { engine, draft, stop, write, release, read: () => preview, time: () => timeListener() };
}
test("hover previews the actual ordinary gradient/grain/feather layer without canonical edits or engine publications", () => {
  const data = fixture(),
    before = data.engine.getSnapshot(),
    listener = vi.fn();
  const stop = data.engine.subscribe(listener);
  data.draft.preview(recipe.id);
  expect(data.engine.getSnapshot()).toBe(before);
  expect(listener).not.toHaveBeenCalled();
  expect(data.read()).toMatchObject({
    target: "page",
    patch: {
      layers: [
        {
          kind: "rectangle",
          fillGradient: recipe.gradient,
          effects: [{ type: "grain" }, { type: "feather" }],
        },
        { id: "fg" },
      ],
    },
  });
  data.draft.cancel();
  expect(data.read()).toBeNull();
  expect(data.engine.getSnapshot().canUndo).toBe(false);
  stop();
  data.stop();
});
test("time changes, document changes, owner changes and unmount cancel owned drafts and release subscriptions", () => {
  const data = fixture();
  data.draft.preview(recipe.id);
  data.time();
  expect(data.read()).toBeNull();
  data.draft.preview(recipe.id);
  data.engine.select(["fg"]);
  expect(data.read()).toBeNull();
  data.draft.preview(recipe.id);
  data.engine.execute({ type: "renameProject", name: "Changed" });
  expect(data.read()).toBeNull();
  data.draft.preview(recipe.id);
  data.stop();
  expect(data.read()).toBeNull();
  expect(data.release).toHaveBeenCalledOnce();
});
test("rollback does not clear another surface's later draft and failure never publishes a partial recipe", () => {
  const data = fixture();
  data.draft.preview(recipe.id);
  const other: PreviewValue = { target: "page", patch: { background: "#123456" } };
  data.write(other);
  data.draft.cancel();
  expect(data.read()).toBe(other);
  expect(() => data.draft.preview("missing")).toThrow();
  expect(data.read()).toBe(other);
  data.stop();
});
