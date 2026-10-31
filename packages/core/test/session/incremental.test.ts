import { afterEach, describe, expect, it, vi } from "vitest";
import { createEffect, createLayer, createPage, createProject } from "../../src/document/factories";
import { cloneValue, freezeValue } from "../../src/document/immutable";
import * as validation from "../../src/document/validation";
import * as identity from "../../src/document/identity";
import * as motionValidation from "../../src/motion/validation";
import { EditorEngine } from "../../src/session/engine";
import { commandMutationScope } from "../../src/session/scopes";
import { validateLocalProject } from "../../src/document/local-validation";
import type { Command } from "../../src/document/model";
import type { CommandCommitInfo } from "../../src/animation/model";

function fixture() {
  return createProject({
    pages: [
      createPage({
        id: "active",
        layers: [createLayer("rectangle", { id: "a" }), createLayer("rectangle", { id: "b" })],
      }),
      ...Array.from({ length: 12 }, (_, page) =>
        createPage({
          id: `page-${page}`,
          layers: Array.from({ length: 30 }, (_, layer) =>
            createLayer("rectangle", {
              id: `layer-${page}-${layer}`,
              effects: [createEffect("blur")],
            }),
          ),
        }),
      ),
    ],
  });
}
afterEach(() => vi.restoreAllMocks());
describe("certified incremental transactions", () => {
  it("validates each touched layer once and never rescans global IDs, assets, Motion or unrelated pages", () => {
    const engine = new EditorEngine(fixture());
    const before = engine.getSnapshot();
    const full = vi.spyOn(validation, "validateProject");
    const layer = vi.spyOn(validation, "validateLayer");
    const page = vi.spyOn(validation, "validatePageMetadata");
    const collect = vi.spyOn(identity, "collectProjectIds");
    const reserve = vi.spyOn(identity, "reserveProjectIds");
    const motion = vi.spyOn(motionValidation, "validateCompositionMotion");
    engine.transaction([
      { type: "updateLayers", ids: ["a"], patch: { x: 20 } },
      { type: "updateLayerPatches", patches: [{ id: "a", patch: { fill: "#123456" } }] },
      { type: "renameProject", name: "Local batch" },
      { type: "updatePage", targetId: "page-8", patch: { name: "Neighbor metadata" } },
    ]);
    const after = engine.getSnapshot();
    expect(full).not.toHaveBeenCalled();
    expect(collect).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
    expect(motion).not.toHaveBeenCalled();
    expect(layer).toHaveBeenCalledTimes(1);
    expect(layer.mock.calls[0]![0]).toBe(after.project.pages[0]!.layers[0]);
    expect(page).toHaveBeenCalledTimes(1);
    expect(page.mock.calls[0]![0]).toBe(after.project.pages[9]);
    expect(after.project.assets).toBe(before.project.assets);
    expect(after.project.pages[0]!.layers[1]).toBe(before.project.pages[0]!.layers[1]);
    expect(after.project.pages[9]!.layers).toBe(before.project.pages[9]!.layers);
    for (const index of [1, 2, 8, 10, 12])
      expect(after.project.pages[index]).toBe(before.project.pages[index]);
    engine.undo();
    expect(engine.getSnapshot().project).toBe(before.project);
    engine.redo();
    expect(engine.getSnapshot().project).toBe(after.project);
  });

  it("rejects local validation certificates for arbitrary frozen imports", () => {
    const project = freezeValue(fixture());
    const scope = commandMutationScope(project, "active", [{ type: "renameProject", name: "New" }]);
    expect(scope.kind).toBe("local");
    expect(() =>
      validateLocalProject(project, { ...project, name: "New" }, { pages: new Map() }),
    ).toThrow("certified base");
    const invalid = cloneValue(project);
    invalid.pages[12]!.layers[29]!.opacity = NaN;
    expect(() => new EditorEngine(invalid)).toThrow();
    const engine = new EditorEngine(project);
    const before = engine.getSnapshot();
    expect(() => engine.load(invalid)).toThrow();
    expect(engine.getSnapshot()).toBe(before);
  });

  it("falls back for structural/reference edits and rejects mixed invalid batches atomically", () => {
    const engine = new EditorEngine(fixture());
    const before = engine.getSnapshot();
    const events = vi.fn();
    engine.subscribe(events);
    engine.subscribeCommands(events);
    const full = vi.spyOn(validation, "validateProject");
    const badPatches = [
      { effects: [createEffect("blur", { id: "layer-11-29" })] },
      { mask: { layerId: "absent", enabled: true, inverted: false } },
      { parentId: "missing" },
      { assetId: "missing" },
    ];
    for (const patch of badPatches) {
      expect(() =>
        engine.transaction([
          { type: "renameProject", name: "Must roll back" },
          { type: "updateLayers", ids: ["a"], patch },
        ]),
      ).toThrow();
      expect(engine.getSnapshot()).toBe(before);
    }
    expect(full).toHaveBeenCalledTimes(3); // parentId is rejected by the handler first.
    expect(events).not.toHaveBeenCalled();
    engine.transaction([
      { type: "renameProject", name: "Structural fallback" },
      { type: "addLayers", layers: [createLayer("rectangle", { id: "new" })] },
    ]);
    expect(full).toHaveBeenCalledTimes(4);
    expect(engine.getSnapshot().project.pages[0]!.layers.at(-1)!.id).toBe("new");
  });

  it("retains dependent scalar guards, ancestor locks and batch atomicity", () => {
    const parent = createLayer("group", { id: "parent" });
    const child = createLayer("rectangle", {
      id: "child",
      parentId: "parent",
      width: 100,
      padding: { top: 0, right: 40, bottom: 0, left: 40 },
      guides: [{ id: "child-guide", axis: "x", position: 95 }],
    });
    const engine = new EditorEngine(
      createProject({ pages: [createPage({ layers: [parent, child] })] }),
    );
    const before = engine.getSnapshot();
    for (const commands of [
      [{ type: "updateLayers", ids: ["child"], patch: { width: 50 } }],
      [{ type: "updateLayers", ids: ["child"], patch: { affine: [1, 0, 1, 0] } }],
      [
        { type: "updateLayers", ids: ["parent"], patch: { locked: true } },
        { type: "updateLayers", ids: ["child"], patch: { x: 2 } },
      ],
      [
        { type: "renameProject", name: "No partial state" },
        { type: "updatePage", patch: { width: -1 } },
      ],
    ] satisfies Command[][]) {
      expect(() => engine.transaction(commands)).toThrow();
      expect(engine.getSnapshot()).toBe(before);
    }
  });

  it("captures caller commands before deriving scopes and preserves summary event fields", () => {
    const commands: Command[] = [{ type: "updateLayers", ids: ["a"], patch: { x: 22 } }];
    const engine = new EditorEngine(fixture(), {
      now: () => {
        commands[0] = { type: "renameProject", name: "Mutated externally" };
        return "2026-01-01T00:00:00.000Z";
      },
    });
    const events: CommandCommitInfo[] = [];
    engine.subscribeCommitInfo((event) => events.push(event));
    engine.transaction(commands);
    expect(events[0]!.types).toEqual(["updateLayers"]);
    expect(events[0]!.layerFields).toEqual(["x"]);
    expect(events[0]!.snapshot.project.pages[0]!.layers[0]!.x).toBe(22);
    expect(engine.getSnapshot().project.name).not.toBe("Mutated externally");
  });

  it("reuses indexes across history and rejects stale/cancelled preparations without reserving IDs", () => {
    const engine = new EditorEngine(fixture());
    const stale = engine.reserveTransaction(
      [
        { type: "updateLayers", ids: ["a"], patch: { x: 41 } },
        { type: "renameProject", name: "Stale" },
      ],
      { deferLock: true },
    );
    engine.execute({ type: "renameProject", name: "Current" });
    expect(() => stale.commit()).toThrow("stale");
    stale.cancel();
    expect(engine.getSnapshot().project.pages[0]!.layers[0]!.x).not.toBe(41);
    engine.undo();
    const collect = vi.spyOn(identity, "collectProjectIds");
    engine.execute({ type: "updateLayers", ids: ["a"], patch: { y: 13 } });
    expect(collect).not.toHaveBeenCalled();
    const pending = engine.reserveTransaction([{ type: "addPage" }]);
    const candidateId = pending.project.pages.at(-1)!.id;
    pending.cancel();
    engine.execute({ type: "addPage" });
    expect(engine.getSnapshot().project.pages.at(-1)!.id).toBe(candidateId);
    const fresh = new EditorEngine(createProject());
    fresh.transaction([
      { type: "addPage" },
      { type: "addLayers", layers: [createLayer("rectangle", { id: "page-1" })] },
    ]);
    expect(fresh.getSnapshot().pageId).toBe("page-2");
    expect(fresh.getSnapshot().project.pages.at(-1)!.layers[0]!.id).toBe("page-1");
  });
});
