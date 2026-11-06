import { expect, it } from "vitest";
import { createEffect, createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { frameSourceKeys } from "../../src/compositing/frame-source-keys";
import { compositionPaintKey } from "../../src/cache/composition-key";

it("invalidates Auto owner and ancestor caches when a parent becomes animated, including time zero with no snapshots", () => {
  const effect = createEffect("trail"),
    parent = createLayer("group", { id: "parent" }),
    owner = createLayer("text", { id: "owner", parentId: "parent", effects: [effect] }),
    neighbour = createLayer("rectangle", { id: "neighbour" }),
    page = createPage({ layers: [parent, owner, neighbour], effects: [createEffect("trail")] }),
    engine = new EditorEngine(createProject({ pages: [page] }));
  const before = frameSourceKeys(page, {}, {}, {});
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  for (const [time, value] of [
    [0, 0],
    [1, 100],
  ] as const)
    engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: parent.id, property: "x" },
      time: { value: time, rate: 1 },
      value,
    });
  const animated = engine.getSnapshot().project.pages[0]!,
    after = frameSourceKeys(animated, {}, {}, {});
  for (const layer of [parent, owner]) {
    expect(after.keyFor(layer)).not.toBe(before.keyFor(layer));
    expect(after.referenceKeyFor(layer)).not.toBe(before.referenceKeyFor(layer));
  }
  expect(after.keyFor(neighbour)).toBe(before.keyFor(neighbour));
  expect(compositionPaintKey(animated, [], () => "same")).not.toBe(
    compositionPaintKey(page, [], () => "same"),
  );
});
