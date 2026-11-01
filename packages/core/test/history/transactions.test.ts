import { expect, it } from "vitest";
import { createLayer, createPage, type CommandCommitInfo } from "../../src/index";
import { fixture, scalar } from "./support";

it("captures the actual inactive page and command context after adding a page, retaining distinct transaction properties", () => {
  const d = fixture();
  d.engine.transaction([
    { type: "addPage", page: createPage({ id: "other", background: "#ffffff" }) },
    { type: "updatePage", patch: { background: "#ff0000" } },
    { type: "updatePage", targetId: "page", patch: { background: "#00ff00", width: 500 } },
  ]);
  expect(d.events).toHaveLength(1);
  expect(d.properties()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        target: { owner: { kind: "composition", compositionId: "other" }, property: "background" },
        before: scalar("#ffffff"),
        after: scalar("#ff0000"),
      }),
      expect.objectContaining({
        target: { owner: { kind: "composition", compositionId: "page" }, property: "background" },
        after: scalar("#00ff00"),
      }),
      expect.objectContaining({
        target: { owner: { kind: "composition", compositionId: "page" }, property: "width" },
        after: scalar(500),
      }),
    ]),
  );
  const description = d.description();
  d.engine.undo();
  expect(d.description()).toBe(description);
  expect(d.engine.getSnapshot().project.pages).toHaveLength(1);
  d.engine.redo();
  expect(d.description()).toBe(description);
});

it("aggregates repeated writes first-before/final-after and does not let no-op bulk fields consume the budget", () => {
  const layers = Array.from({ length: 100 }, (_, index) =>
    createLayer("rectangle", { id: `item-${index}`, fill: index === 99 ? "#ffffff" : "#000000" }),
  );
  const d = fixture(layers);
  d.engine.execute({
    type: "updateLayers",
    ids: layers.map((layer) => layer.id),
    patch: { fill: "#000000", opacity: 1, x: 80 },
  });
  expect(d.description().additionalChanges).toBe(false);
  expect(d.properties()).toHaveLength(1);
  expect(d.properties()[0]).toMatchObject({
    target: { owner: { layerId: "item-99" }, property: "fill" },
    before: scalar("#ffffff"),
    after: scalar("#000000"),
  });
  d.engine.transaction([
    { type: "updateLayers", ids: layers.map((layer) => layer.id), patch: { fill: "#ff0000" } },
    { type: "updateLayers", ids: ["item-0"], patch: { fill: "#00ff00" } },
  ]);
  expect(d.description().changes).toHaveLength(64);
  expect(d.description().additionalChanges).toBe(true);
  expect(d.properties()[0]).toMatchObject({ before: scalar("#000000"), after: scalar("#00ff00") });
});

it("keeps independent multi-layer values truthful rather than inventing a shared restored color", () => {
  const d = fixture([
    createLayer("rectangle", { id: "a", fill: "#ff0000" }),
    createLayer("rectangle", { id: "b", fill: "#00ff00" }),
  ]);
  d.engine.execute({ type: "updateLayers", ids: ["a", "b"], patch: { fill: "#ffffff" } });
  expect(d.properties().map((change) => change.before)).toEqual([
    scalar("#ff0000"),
    scalar("#00ff00"),
  ]);
  expect(
    d
      .properties()
      .every((change) => change.after.kind === "scalar" && change.after.value === "#ffffff"),
  ).toBe(true);
});

it("freezes detached bounded values, including Unicode text, without putting large geometry in descriptions", () => {
  const d = fixture([createLayer("text", { id: "text", text: "old" })]);
  const patch = { text: "😀".repeat(140) };
  d.engine.execute({ type: "updateLayers", ids: ["text"], patch });
  const description = d.description(),
    change = d.properties()[0]!;
  patch.text = "mutated caller";
  expect(change.after).toEqual({ kind: "scalar", value: "😀".repeat(120), truncated: true });
  expect(Object.isFrozen(description)).toBe(true);
  expect(Object.isFrozen(description.changes)).toBe(true);
  expect(Object.isFrozen(change.target.owner)).toBe(true);
  expect(JSON.stringify(description)).not.toContain("mutated caller");
});

it("rejects failed, cancelled and stale prepared changes without publishing or retaining their descriptions", () => {
  const d = fixture();
  expect(() =>
    d.engine.transaction([
      { type: "updateLayers", ids: ["item"], patch: { fill: "#ff0000" } },
      { type: "updateLayers", ids: ["item"], patch: { width: -1 } },
    ]),
  ).toThrow();
  expect(d.events).toHaveLength(0);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  const cancelled = d.engine.reserveTransaction([{ type: "renameProject", name: "Cancelled" }]);
  cancelled.cancel();
  expect(d.events).toHaveLength(0);
  const stale = d.engine.reserveTransaction([{ type: "renameProject", name: "Stale" }], {
    deferLock: true,
  });
  d.engine.execute({ type: "updateLayers", ids: ["item"], patch: { opacity: 0.5 } });
  expect(() => stale.commit()).toThrow();
  stale.cancel();
  expect(d.events).toHaveLength(1);
  d.engine.undo();
  expect(d.properties()[0]!.target.property).toBe("opacity");
});

it("publishes the matching immutable descriptions in order when snapshot subscribers synchronously undo", () => {
  const d = fixture();
  let undone = false;
  d.engine.subscribe(() => {
    if (!undone && d.engine.getSnapshot().canUndo) {
      undone = true;
      d.engine.undo();
    }
  });
  d.engine.execute({ type: "updateLayers", ids: ["item"], patch: { fill: "#ff0000" } });
  expect(d.events.map((event: CommandCommitInfo) => event.kind)).toEqual(["commit", "undo"]);
  expect(d.events[1]!.history).toBe(d.events[0]!.history);
  expect(d.events[0]!.snapshot.project.pages[0]!.layers[0]!.fill).toBe("#ff0000");
  expect(d.events[1]!.snapshot.project.pages[0]!.layers[0]!.fill).toBe("#000000");
});
