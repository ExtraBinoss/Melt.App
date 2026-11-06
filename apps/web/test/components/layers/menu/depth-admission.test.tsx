import { expect, test } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { createLayer, createPage, createProject, createSpatialLayer } from "@musart/core";
import { AddEffect } from "../../../../src/components/layers/menu/AddEffect";
import { setup } from "../../../support/ui";

function mount(selection: readonly string[]) {
  const d = setup();
  const group = createLayer("group", { id: "group" }),
    a = createLayer("rectangle", {
      id: "a",
      parentId: group.id,
      spatial: createSpatialLayer("box"),
    }),
    b = createLayer("rectangle", { id: "b", spatial: createSpatialLayer("sphere") }),
    flat = createLayer("rectangle", { id: "flat" });
  d.engine.load(createProject({ pages: [createPage({ layers: [group, a, b, flat] })] }));
  d.engine.select([...selection]);
  d.mount(
    <AddEffect
      engine={d.engine}
      page={d.engine.getSnapshot().project.pages[0]!}
      selection={[...selection]}
      run={d.run}
      category="effect"
    />,
  );
  fireEvent.pointerDown(screen.getByLabelText("Ajouter un effet"), { button: 0, ctrlKey: false });
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "depth-of-field" } });
  return d;
}

test.each([[["a"]], [["group"]], [["a", "b"]]])(
  "Classic native selection %j exposes DOF on every actual target",
  (selection) => {
    const d = mount(selection);
    const item = document.querySelector<HTMLElement>('[data-effect-catalog-item="depth-of-field"]');
    expect(item).not.toBeNull();
    fireEvent.click(item!);
    const layers = d.engine.getSnapshot().project.pages[0]!.layers;
    for (const id of selection)
      expect(layers.find((layer) => layer.id === id)!.effects[0]?.type).toBe("depth-of-field");
    d.engine.undo();
    expect(
      d.engine.getSnapshot().project.pages[0]!.layers.every((layer) => !layer.effects.length),
    ).toBe(true);
  },
);

test.each([[["flat"]], [["a", "flat"]]])(
  "Classic non-native selection %j hides DOF without hiding generic Trail",
  (selection) => {
    mount(selection);
    expect(document.querySelector('[data-effect-catalog-item="depth-of-field"]')).toBeNull();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "trail" } });
    expect(document.querySelector('[data-effect-catalog-item="trail"]')).not.toBeNull();
  },
);

test("a native catalog cannot apply DOF after the active selection changes to a flat target", () => {
  const d = mount(["a"]);
  const item = document.querySelector<HTMLElement>('[data-effect-catalog-item="depth-of-field"]')!;
  expect(item).not.toBeNull();
  act(() => d.engine.select(["flat"]));
  fireEvent.click(item);
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers.every((layer) => !layer.effects.length),
  ).toBe(true);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
