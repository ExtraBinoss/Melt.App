import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { createSpatialLayer } from "@musart/core";
import { StudioObjectBar } from "../../../src/ui/studio/panels/StudioObjectBar";
import { setup } from "../../support/ui";

test("model/primitive size preserves proportions within every native axis limit with one undo", () => {
  const d = setup();
  const spatial = { ...createSpatialLayer("box"), scaleX: 1.6, scaleY: 0.065, scaleZ: 0.75 };
  d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { spatial } });
  d.engine.select([d.rectangle.id]);
  const before = d.engine.getSnapshot().project;
  d.mount(<StudioObjectBar engine={d.engine} run={d.run} />);
  const slider = screen.getByRole("slider", { name: "Échelle" });
  expect(slider).toHaveAttribute("aria-valuemin", "0.03");
  expect(screen.queryByRole("slider", { name: "Profondeur" })).toBeNull();
  fireEvent.keyDown(slider, { key: "Home" });
  fireEvent.keyUp(slider, { key: "Home" });
  const next = d.engine
    .getSnapshot()
    .project.pages[0]!.layers.find((l) => l.id === d.rectangle.id)!.spatial!;
  expect(next.scaleX).toBeCloseTo(0.03);
  expect(next.scaleY).toBeGreaterThanOrEqual(0.001);
  expect(next.scaleY / next.scaleX).toBeCloseTo(spatial.scaleY / spatial.scaleX);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before);
});

test("primitive direct rotation and advanced axis transforms use canonical reversible properties", () => {
  const d = setup();
  d.engine.execute({
    type: "updateLayers",
    ids: [d.rectangle.id],
    patch: { spatial: { ...createSpatialLayer("box"), z: 20 } },
  });
  d.engine.select([d.rectangle.id]);
  const before = d.engine.getSnapshot().project;
  d.mount(<StudioObjectBar engine={d.engine} run={d.run} />);
  const rotation = screen.getByRole("slider", { name: "Rotation Y" });
  fireEvent.keyDown(rotation, { key: "ArrowRight" });
  fireEvent.keyUp(rotation, { key: "ArrowRight" });
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.spatial!.rotationY).toBe(1);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before);
  act(() => screen.getByRole("button", { name: "Avancé" }).click());
  const position = screen.getByRole("slider", { name: "Position Z" });
  expect(Number(position.getAttribute("aria-valuemax"))).toBeGreaterThanOrEqual(20);
  fireEvent.keyDown(position, { key: "ArrowLeft" });
  fireEvent.keyUp(position, { key: "ArrowLeft" });
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.spatial!.z).toBeCloseTo(19.99);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before);
});
