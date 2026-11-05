import { expect, it } from "vitest";
import { createEffect, createPage, getHistoryPropertyDefinition } from "../../src/index";
import { fixture, scalar } from "./support";

it("retains composition effect identities, parameters and exact undo/redo metadata on inactive pages", () => {
  const d = fixture(),
    effect = createEffect("blur", { id: "composition-blur", amount: 0.57 });
  d.engine.execute({ type: "addPage", page: createPage({ id: "inactive", effects: [effect] }) });
  d.engine.setPage("page");
  d.engine.execute({
    type: "updatePage",
    targetId: "inactive",
    patch: { effects: [{ ...effect, amount: 0.25 }] },
  });
  const description = d.description();
  expect(description.changes).toEqual([
    {
      kind: "property",
      target: {
        owner: {
          kind: "effect",
          compositionId: "inactive",
          effectId: effect.id,
          effectType: "blur",
        },
        property: "amount",
      },
      before: scalar(0.57),
      after: scalar(0.25),
    },
  ]);
  expect(getHistoryPropertyDefinition(d.properties()[0]!.target)).toMatchObject({
    displayScale: 100,
    unit: "%",
  });
  d.engine.undo();
  expect(d.description()).toBe(description);
  expect(d.engine.getSnapshot().project.pages[1]!.effects![0]!.amount).toBe(0.57);
  d.engine.redo();
  expect(d.description()).toBe(description);
  expect(d.engine.getSnapshot().project.pages[1]!.effects![0]!.amount).toBe(0.25);
});

it("records real composition effect add/delete/reorder actions and rejects invalid atomic edits", () => {
  const d = fixture(),
    blur = createEffect("blur", { id: "blur" }),
    grain = createEffect("grain", { id: "grain" });
  d.engine.execute({ type: "updatePage", patch: { effects: [blur, grain] } });
  expect(d.description().changes).toEqual(
    [blur, grain].map((effect) => ({
      kind: "action",
      action: "add",
      owner: {
        kind: "effect",
        compositionId: "page",
        effectId: effect.id,
        effectType: effect.type,
      },
    })),
  );
  d.engine.execute({ type: "updatePage", patch: { effects: [grain, blur] } });
  expect(d.description().changes).toEqual([
    {
      kind: "action",
      action: "reorder",
      owner: { kind: "composition", compositionId: "page" },
    },
  ]);
  const before = d.engine.getSnapshot(),
    count = d.events.length;
  expect(() =>
    d.engine.transaction([
      { type: "updatePage", patch: { effects: [{ ...grain, amount: 0.25 }] } },
      { type: "updatePage", patch: { width: -1 } },
    ]),
  ).toThrow();
  expect(d.events).toHaveLength(count);
  expect(d.engine.getSnapshot()).toBe(before);
  expect(() =>
    d.engine.execute({
      type: "updatePage",
      patch: { effects: [{ ...grain, amount: Number.NaN }] },
    }),
  ).toThrow();
  expect(d.engine.getSnapshot()).toBe(before);
  expect(d.events).toHaveLength(count);
  d.engine.execute({ type: "updatePage", patch: { effects: [grain] } });
  expect(d.description().changes[0]).toEqual({
    kind: "action",
    action: "delete",
    owner: { kind: "effect", compositionId: "page", effectId: blur.id, effectType: "blur" },
  });
  d.engine.undo();
  expect(d.page().effects?.map((effect) => effect.id)).toEqual([grain.id, blur.id]);
});
