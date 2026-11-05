import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { createPage, createProject, createSpatialLayer, spatialMaterial } from "@musart/core";
import { MaterialControl } from "../../../src/components/spatial/MaterialControl";
import { previewAtom } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";

function fixture() {
  const d = setup();
  const spatial = (preset: string) => ({
    ...createSpatialLayer("sphere"),
    material: { ...spatialMaterial(preset).settings },
  });
  d.engine.transaction([
    { type: "updateLayers", ids: [d.rectangle.id], patch: { spatial: spatial("gold") } },
    { type: "updateLayers", ids: [d.text.id], patch: { spatial: spatial("glassCoral") } },
  ]);
  const otherPage = createPage();
  const project = d.engine.getSnapshot().project;
  d.engine.load({ ...project, pages: [...project.pages, otherPage] });
  d.engine.select([d.rectangle.id]);
  d.mount(<MaterialControl engine={d.engine} run={d.run} />);
  const trigger = () => screen.getByRole("button", { name: "Matière", exact: true });
  const swatch = () =>
    trigger().querySelector<HTMLElement>(".studio-catalog-swatch")!.style.backgroundPosition;
  return { ...d, otherPage, trigger, swatch };
}

test("Studio remembers only the swatch after deselection and follows the next selected material", () => {
  const d = fixture();
  const original = d.engine.getSnapshot().project;
  const gold = d.swatch();
  act(() => d.engine.select([]));
  expect(d.swatch()).toBe(gold);
  expect(d.trigger()).toBeDisabled();
  fireEvent.click(d.trigger());
  expect(screen.queryByRole("region", { name: "Matière", exact: true })).toBeNull();
  expect(d.engine.getSnapshot().project).toBe(original);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.run).not.toHaveBeenCalled();

  act(() => d.engine.select([d.image.id]));
  expect(d.swatch()).toBe(gold);
  expect(d.trigger()).toBeDisabled();
  act(() => d.engine.select([d.text.id]));
  const glass = d.swatch();
  expect(glass).not.toBe(gold);
  expect(d.trigger()).toBeEnabled();
  act(() => d.engine.select([]));
  expect(d.swatch()).toBe(glass);
  expect(d.trigger()).toBeDisabled();
  expect(d.engine.getSnapshot().project).toBe(original);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});

test("deleting the remembered object leaves no editable target, and page or project changes reset the swatch", () => {
  const d = fixture();
  const gold = d.swatch();
  act(() => d.engine.select([]));
  act(() => d.engine.execute({ type: "deleteLayers", ids: [d.rectangle.id] }));
  const deleted = d.engine.getSnapshot().project;
  expect(d.swatch()).toBe(gold);
  expect(d.trigger()).toBeDisabled();
  fireEvent.click(d.trigger());
  expect(d.engine.getSnapshot().project).toBe(deleted);
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.run).not.toHaveBeenCalled();

  act(() => d.engine.setPage(d.otherPage.id));
  const empty = d.swatch();
  expect(empty).not.toBe(gold);
  expect(d.trigger()).toBeDisabled();
  act(() => d.engine.setPage(d.page.id));
  act(() => d.engine.select([d.text.id]));
  expect(d.swatch()).not.toBe(empty);
  act(() => d.engine.select([]));
  act(() => d.engine.load(createProject({ pages: [createPage({ id: d.page.id })] })));
  expect(d.swatch()).toBe(empty);
  expect(d.trigger()).toBeDisabled();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
