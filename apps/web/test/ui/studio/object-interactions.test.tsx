import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { createSpatialLayer } from "@musart/core";
import { StudioObjectBar } from "../../../src/ui/studio/panels/StudioObjectBar";
import { setup } from "../../support/ui";
import { previewAtom } from "../../../src/state/session/editor";

function fixture() {
  const d = setup();
  d.engine.execute({
    type: "updateLayers",
    ids: [d.text.id],
    patch: {
      spatial: { ...createSpatialLayer("extrude"), scaleX: 1, scaleY: 2, scaleZ: 3 },
    },
  });
  d.engine.load(d.engine.getSnapshot().project);
  d.engine.select([d.text.id]);
  d.mount(<StudioObjectBar engine={d.engine} run={d.run} />);
  return {
    ...d,
    layer: () =>
      d.engine.getSnapshot().project.pages[0]!.layers.find((layer) => layer.id === d.text.id)!,
  };
}

test("linked XYZ edits preserve proportions, unlink changes one axis, with one undo and cancellation", () => {
  const d = fixture(),
    original = d.engine.getSnapshot().project;
  fireEvent.click(screen.getByRole("button", { name: "Avancé" }));
  let input = screen.getByRole("textbox", { name: "Échelle X" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "2" } });
  expect(d.engine.getSnapshot().project).toBe(original);
  expect(d.store.get(previewAtom)).toMatchObject({
    patch: { spatial: { scaleX: 2, scaleY: 4, scaleZ: 6 } },
  });
  fireEvent.blur(input);
  expect(d.layer().spatial).toMatchObject({ scaleX: 2, scaleY: 4, scaleZ: 6 });
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(original);
  fireEvent.click(screen.getByRole("button", { name: "Délier les axes de l’échelle" }));
  input = screen.getByRole("textbox", { name: "Échelle Y" });
  fireEvent.change(input, { target: { value: "5" } });
  fireEvent.blur(input);
  expect(d.layer().spatial).toMatchObject({ scaleX: 1, scaleY: 5, scaleZ: 3 });
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(original);
  fireEvent.change(input, { target: { value: "9" } });
  fireEvent.keyDown(input, { key: "Escape" });
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});

test("text wrapping bounds preview without document edits and commit as one reversible edit", () => {
  const d = fixture(),
    original = d.engine.getSnapshot().project;
  fireEvent.click(screen.getByRole("button", { name: "Avancé" }));
  const width = screen.getByRole("textbox", { name: "Largeur" });
  fireEvent.change(width, { target: { value: "900" } });
  expect(d.engine.getSnapshot().project).toBe(original);
  expect(d.store.get(previewAtom)).toMatchObject({ patch: { width: 900 } });
  fireEvent.blur(width);
  expect(d.layer().width).toBe(900);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(original);
});

test("flat Studio text exposes the same wrapping bounds without requiring a native source", () => {
  const d = setup();
  d.engine.select([d.text.id]);
  d.mount(<StudioObjectBar engine={d.engine} run={d.run} />);
  fireEvent.click(screen.getByRole("button", { name: "Avancé" }));
  expect(screen.getByRole("textbox", { name: "Largeur" })).toBeVisible();
  expect(screen.queryByRole("textbox", { name: "Échelle X" })).toBeNull();
});
