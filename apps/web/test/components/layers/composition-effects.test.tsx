import type { ComponentProps } from "react";
import { act, fireEvent, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { createEffect, createPage, createProject } from "@musart/core";
import { LayersPanel } from "../../../src/components/layers/LayersPanel";
import type { EffectParameters } from "../../../src/components/properties/effects/EffectParameters";
import { previewAtom, useEngine } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";

const controls = vi.hoisted(() => ({ parameters: vi.fn() }));
vi.mock("../../../src/components/properties/effects/EffectParameters", () => ({
  EffectParameters: (props: ComponentProps<typeof EffectParameters>) => {
    controls.parameters(props);
    return <div data-effect-test={props.effect.id} />;
  },
}));

function fixture() {
  const d = setup({ reducedMotion: true });
  const effects = [
    createEffect("exposure", { id: "composition-exposure" }),
    createEffect("grain", { id: "composition-grain" }),
  ];
  d.engine.execute({ type: "updatePage", patch: { effects } });
  d.engine.load(d.engine.getSnapshot().project);
  let renders = 0;
  function Live() {
    const snapshot = useEngine(d.engine);
    renders++;
    return (
      <LayersPanel
        engine={d.engine}
        project={snapshot.project}
        page={snapshot.project.pages.find((item) => item.id === snapshot.pageId)!}
        selection={snapshot.selection}
        run={d.run}
      />
    );
  }
  d.mount(<Live />);
  const row = (id: string) =>
    document.querySelector<HTMLElement>(`[data-composition-effect-id="${id}"]`)!;
  const open = () => {
    fireEvent.click(row(effects[0]!.id).querySelector<HTMLElement>(".attachment-name")!);
    return controls.parameters.mock.calls.at(-1)![0] as ComponentProps<typeof EffectParameters>;
  };
  return { ...d, effects, row, open, renders: () => renders };
}

test("shared LayersPanel exposes actual composition effects with reversible toggles/removal and independent expansion", () => {
  const d = fixture();
  const before = d.engine.getSnapshot().project;
  const page = before.pages[0]!;
  expect(document.querySelectorAll("[data-composition-effect-id]")).toHaveLength(2);
  expect(page.layers).toHaveLength(3);
  expect(d.row(d.effects[0]!.id)).toHaveAttribute("aria-level", "3");
  fireEvent.click(
    within(d.row(d.effects[0]!.id)).getByRole("button", { name: "Désactiver l’effet" }),
  );
  expect(d.engine.getSnapshot().project.pages[0]!.effects?.[0]).toMatchObject({
    id: d.effects[0]!.id,
    enabled: false,
  });
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toBe(page.layers);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before);
  fireEvent.click(within(d.row(d.effects[1]!.id)).getByRole("button", { name: "Retirer l’effet" }));
  expect(d.engine.getSnapshot().project.pages[0]!.effects?.map((effect) => effect.id)).toEqual([
    d.effects[0]!.id,
  ]);
  act(() => d.engine.undo());
  const root = document.querySelector<HTMLElement>("[data-composition-effects]")!;
  const revision = d.engine.getSnapshot().revision;
  fireEvent.click(within(root).getByRole("button", { name: "Replier Composition · Effets" }));
  expect(document.querySelectorAll("[data-composition-effect-id]")).toHaveLength(0);
  expect(root).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(within(root).getByRole("button", { name: "Déplier Composition · Effets" }));
  expect(document.querySelectorAll("[data-composition-effect-id]")).toHaveLength(2);
  expect(d.engine.getSnapshot().revision).toBe(revision);
  fireEvent.click(
    within(root).getByRole("button", { name: "Désactiver l’effet · Composition · Effets" }),
  );
  expect(d.engine.getSnapshot().project.pages[0]!.effects?.every((effect) => !effect.enabled)).toBe(
    true,
  );
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before);
});

test("composition parameter drafts remain imperative, commit once, reorder real IDs and reject stale owners", () => {
  const d = fixture();
  const edit = d.open(),
    before = d.engine.getSnapshot().project,
    renders = d.renders();
  act(() => edit.onStart?.());
  for (const amount of [0.2, 0.4, 0.6]) act(() => edit.onChange({ amount }, true));
  expect(d.renders()).toBe(renders);
  expect(d.engine.getSnapshot().project).toBe(before);
  expect(d.store.get(previewAtom)).toMatchObject({
    target: "page",
    patch: { effects: [{ id: d.effects[0]!.id, amount: 0.6 }, d.effects[1]] },
  });
  act(() => edit.onChange({ amount: 0.6 }, false));
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.engine.getSnapshot().project.pages[0]!.effects?.[0]!.amount).toBe(0.6);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before);
  const popover = document.querySelector<HTMLElement>("[data-composition-effect-controls]")!;
  fireEvent.click(within(popover).getByRole("button", { name: "Descendre l’effet" }));
  expect(d.engine.getSnapshot().project.pages[0]!.effects?.map((effect) => effect.id)).toEqual([
    d.effects[1]!.id,
    d.effects[0]!.id,
  ]);
  act(() => d.engine.undo());
  act(() => d.engine.load(createProject({ pages: [createPage({ id: d.page.id })] })));
  const replacement = d.engine.getSnapshot();
  act(() => edit.onChange({ amount: 0.9 }, false));
  expect(d.engine.getSnapshot()).toBe(replacement);
});

test("composition controls reject deferred overwrites and cancel only their own draft", () => {
  const d = fixture();
  const edit = d.open();
  act(() => edit.onChange({ amount: 0.4 }, true));
  const foreign = { target: "layer" as const, layerId: d.rectangle.id, patch: { opacity: 0.4 } };
  act(() => d.store.set(previewAtom, foreign));
  act(() => edit.onCancel?.());
  expect(d.store.get(previewAtom)).toBe(foreign);
  act(() => d.store.set(previewAtom, null));
  const pending: (() => void)[] = [];
  d.run.mockImplementation((task) => {
    pending.push(task);
  });
  const before = d.engine.getSnapshot();
  act(() => edit.onChange({ amount: 0.7 }, false));
  expect(pending).toHaveLength(1);
  act(() => edit.onCancel?.());
  act(() => pending[0]!());
  expect(d.engine.getSnapshot()).toBe(before);
  fireEvent.click(
    within(d.row(d.effects[0]!.id)).getByRole("button", { name: "Désactiver l’effet" }),
  );
  expect(pending).toHaveLength(2);
  act(() => d.engine.load(createProject()));
  const replacement = d.engine.getSnapshot();
  act(() => pending[1]!());
  expect(d.engine.getSnapshot()).toBe(replacement);
});
