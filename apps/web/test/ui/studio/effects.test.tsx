import type { ComponentProps } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { createEffect } from "@musart/core";
import { StudioEffects } from "../../../src/ui/studio/effects/StudioEffects";
import type { EffectParameters } from "../../../src/components/properties/effects/EffectParameters";
import { previewAtom } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";

const controls = vi.hoisted(() => ({ parameters: vi.fn() }));
vi.mock("../../../src/components/properties/effects/EffectParameters", () => ({
  EffectParameters: (props: ComponentProps<typeof EffectParameters>) => {
    controls.parameters(props);
    return <div data-effect-test={props.effect.type} />;
  },
}));
function field() {
  return controls.parameters.mock.calls.at(-1)![0] as ComponentProps<typeof EffectParameters>;
}
function open(label = "Ajouter un étalonnage") {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

test("Studio color grades target a selected item, otherwise the whole composition, and undo restores", () => {
  const d = setup();
  d.engine.select([]);
  d.mount(<StudioEffects engine={d.engine} run={d.run} />);
  open();
  fireEvent.click(screen.getByRole("button", { name: "Exposition" }));
  expect(d.engine.getSnapshot().project.pages[0]!.effects?.[0]!.type).toBe("exposure");
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects).toEqual([]);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project.pages[0]!.effects ?? []).toEqual([]);
  act(() => d.engine.select([d.rectangle.id]));
  fireEvent.click(screen.getByRole("button", { name: "Exposition" }));
  const page = d.engine.getSnapshot().project.pages[0]!;
  expect(page.effects ?? []).toEqual([]);
  expect(page.layers[0]!.effects[0]!.type).toBe("exposure");
});

test("composition parameter previews stay outside React parents and canonical history until release", () => {
  const d = setup();
  d.engine.execute({ type: "updatePage", patch: { effects: [createEffect("exposure")] } });
  d.engine.load(d.engine.getSnapshot().project);
  d.engine.select([]);
  let renders = 0;
  function Parent() {
    renders++;
    return <StudioEffects engine={d.engine} run={d.run} />;
  }
  d.mount(<Parent />);
  open();
  fireEvent.click(screen.getByRole("button", { name: "Pile (1)" }));
  const before = d.engine.getSnapshot().project;
  const originalRenders = renders;
  const edit = field();
  act(() => edit.onStart?.());
  for (const amount of [0.6, 0.7, 0.8]) act(() => edit.onChange({ amount }, true));
  expect(d.engine.getSnapshot().project).toBe(before);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  expect(renders).toBe(originalRenders);
  expect(d.store.get(previewAtom)).toMatchObject({
    target: "page",
    patch: { effects: [{ amount: 0.8 }] },
  });
  act(() => edit.onChange({ amount: 0.8 }, false));
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.engine.getSnapshot().project.pages[0]!.effects?.[0]!.amount).toBe(0.8);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});

test("stale composition gestures cannot overwrite newer paint or a replacement selection", () => {
  const d = setup();
  d.engine.execute({ type: "updatePage", patch: { effects: [createEffect("exposure")] } });
  d.engine.load(d.engine.getSnapshot().project);
  d.engine.select([]);
  d.mount(<StudioEffects engine={d.engine} run={d.run} />);
  open();
  fireEvent.click(screen.getByRole("button", { name: "Pile (1)" }));
  const stale = field();
  act(() => {
    stale.onStart?.();
    stale.onChange({ amount: 0.8 }, true);
  });
  act(() => d.engine.select([d.rectangle.id]));
  const before = d.engine.getSnapshot().project;
  act(() => {
    stale.onChange({ amount: 0.2 }, true);
    stale.onChange({ amount: 0.2 });
  });
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.engine.getSnapshot().project).toBe(before);
  expect(d.run).not.toHaveBeenCalled();
});
