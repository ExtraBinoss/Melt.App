import type { ComponentProps } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import {
  createLayer,
  createSpatialLayer,
  createSpatialScene,
  spatialMaterial,
  type FillGradient,
} from "@musart/core";
import { MaterialControl } from "../../../src/components/spatial/MaterialControl";
import { EnvironmentControl } from "../../../src/components/spatial/EnvironmentControl";
import { StudioSlider } from "../../../src/ui/studio/controls/StudioSlider";
import { previewAtom } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";

const observed = vi.hoisted(() => ({ slider: vi.fn() }));
vi.mock("../../../src/ui/studio/controls/StudioSlider", async (original) => {
  const actual = await original<{ StudioSlider: typeof StudioSlider }>();
  return {
    ...actual,
    StudioSlider: (props: ComponentProps<typeof StudioSlider>) => {
      observed.slider(props);
      return <actual.StudioSlider {...props} />;
    },
  };
});
function control(label: string) {
  return [...observed.slider.mock.calls]
    .reverse()
    .find(([props]) => props.label === label)![0] as ComponentProps<typeof StudioSlider>;
}
function fixture(gradient?: FillGradient) {
  const d = setup();
  d.engine.transaction([
    {
      type: "updateLayers",
      ids: [d.rectangle.id],
      patch: {
        spatial: createSpatialLayer("box"),
        ...(gradient ? { fillGradient: gradient } : {}),
      },
    },
    { type: "updatePage", patch: { spatial: createSpatialScene() } },
  ]);
  d.engine.load(d.engine.getSnapshot().project);
  d.engine.select([d.rectangle.id]);
  const mount = d.mount;
  return {
    ...d,
    mount: (ui: Parameters<typeof mount>[0]) => {
      const view = mount(ui);
      const dock = screen
        .getAllByRole("button")
        .find((button) => ["Matière", "Scène"].includes(button.getAttribute("aria-label") ?? ""));
      if (dock) act(() => dock.click());
      return view;
    },
  };
}

const paint: FillGradient = {
  kind: "linear",
  angle: 30,
  stops: [
    { offset: 0, color: "#8757ff" },
    { offset: 1, color: "#5623a0" },
  ],
};

test("material presets and finish edits preserve active gradient paint", () => {
  const d = fixture(paint);
  d.mount(<MaterialControl engine={d.engine} run={d.run} />);
  const original = d.engine.getSnapshot().project;
  const roughness = control("Rugosité");
  act(() => roughness.onStart?.());
  act(() => roughness.onPreview(0.9));
  expect(d.store.get(previewAtom)).toMatchObject({
    patch: { spatial: { material: { roughness: 0.9 } } },
  });
  act(() => roughness.onCommit(0.9));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.fillGradient).toEqual(paint);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(original);
  fireEvent.click(screen.getByRole("button", { name: "Verre · Corail" }));
  const layer = d.engine.getSnapshot().project.pages[0]!.layers[0]!;
  expect(layer.spatial?.material).toEqual(spatialMaterial("glassCoral").settings);
  expect(layer.fillGradient).toEqual(paint);
  expect(layer.fill).toBe(original.pages[0]!.layers[0]!.fill);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(original);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});

test("the visible material color row previews without parent renders, cancels paint and commits one solid-color undo", () => {
  const d = fixture(paint);
  let renders = 0;
  function Parent() {
    renders++;
    return <MaterialControl engine={d.engine} run={d.run} />;
  }
  d.mount(<Parent />);
  const original = d.engine.getSnapshot().project;
  expect(screen.getByRole("radio", { name: "Dégradé" })).toBeChecked();
  fireEvent.click(screen.getByRole("radio", { name: "Uni" }));
  const solid = d.engine.getSnapshot().project;
  expect(solid.pages[0]!.layers[0]!.fillGradient).toBeUndefined();
  expect(solid.pages[0]!.layers[0]!.fill).toBe(paint.stops[0]!.color);
  fireEvent.click(screen.getByRole("button", { name: "Couleur" }));
  const before = renders;
  const input = screen.getByRole("textbox", { name: "Couleur hexadécimale" });
  fireEvent.change(input, { target: { value: "#22cc55" } });
  expect(d.engine.getSnapshot().project).toBe(solid);
  expect(renders).toBe(before);
  const preview = d.store.get(previewAtom);
  expect(preview).toMatchObject({
    target: "layer",
    layerId: d.rectangle.id,
    patch: { fill: "#22cc55" },
  });
  if (preview?.target !== "layer") throw new Error("Expected the selected layer preview.");
  expect(Object.hasOwn(preview.patch, "fillGradient")).toBe(false);
  fireEvent.keyDown(input, { key: "Escape" });
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.engine.getSnapshot().project).toBe(solid);
  const colorButton = screen.getByRole("button", { name: "Couleur" });
  expect(colorButton).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(colorButton);
  const resumedInput = screen.getByRole("textbox", { name: "Couleur hexadécimale" });
  fireEvent.change(resumedInput, { target: { value: "#22cc55" } });
  fireEvent.keyUp(resumedInput, { key: "Enter" });
  const layer = d.engine.getSnapshot().project.pages[0]!.layers[0]!;
  expect(layer.fill).toBe("#22cc55");
  expect(layer.fillGradient).toBeUndefined();
  expect(d.run).toHaveBeenCalledTimes(2);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(solid);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(original);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});

test("the primary gradient swatch opens real editable stops and preserves the gradient kind", () => {
  const d = fixture(paint);
  d.mount(<MaterialControl engine={d.engine} run={d.run} />);
  const original = d.engine.getSnapshot().project;
  expect(screen.getByRole("radio", { name: "Dégradé" })).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Dégradé" }));
  const stop = screen.getByRole("textbox", { name: "Couleur hexadécimale du point 1" });
  fireEvent.change(stop, { target: { value: "#22cc55" } });
  expect(d.engine.getSnapshot().project).toBe(original);
  fireEvent.blur(stop);
  const gradient = d.engine.getSnapshot().project.pages[0]!.layers[0]!.fillGradient;
  expect(gradient).toEqual({
    ...paint,
    stops: [{ ...paint.stops[0], color: "#22cc55" }, paint.stops[1]],
  });
  expect(d.run).toHaveBeenCalledOnce();
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(original);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});

test("material sliders preview outside document and parent renders, release once, and undo restores the material", () => {
  const d = fixture();
  const original = d.engine.getSnapshot().project;
  let renders = 0;
  function Outer() {
    renders++;
    return <MaterialControl engine={d.engine} run={d.run} />;
  }
  d.mount(<Outer />);
  const before = renders,
    field = control("Rugosité");
  act(() => field.onStart?.());
  for (const value of [0.7, 0.8, 0.9]) act(() => field.onPreview(value));
  expect(d.engine.getSnapshot().project).toBe(original);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  expect(renders).toBe(before);
  expect(d.store.get(previewAtom)).toMatchObject({
    target: "layer",
    layerId: d.rectangle.id,
    patch: { spatial: { material: { roughness: 0.9 } } },
  });
  act(() => field.onCommit(0.9));
  expect(d.run).toHaveBeenCalledOnce();
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.spatial!.material.roughness).toBe(0.9);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(original);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});

test("selection replacement retires a material draft and late captured callbacks cannot edit the new owner", () => {
  const d = fixture();
  d.mount(<MaterialControl engine={d.engine} run={d.run} />);
  const stale = control("Rugosité");
  act(() => {
    stale.onStart?.();
    stale.onPreview(0.9);
  });
  expect(d.store.get(previewAtom)).not.toBeNull();
  act(() => d.engine.select([d.text.id]));
  const original = d.engine.getSnapshot().project;
  act(() => {
    stale.onPreview(0.2);
    stale.onCommit(0.2);
  });
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.engine.getSnapshot().project).toBe(original);
  expect(d.run).not.toHaveBeenCalled();
});

test("a locked ancestor disables the material trigger and keeps its controls closed", () => {
  const d = fixture(),
    project = structuredClone(d.engine.getSnapshot().project);
  const group = createLayer("group", { name: "Locked group", locked: true });
  project.pages[0]!.layers[0]!.parentId = group.id;
  project.pages[0]!.layers.push(group);
  d.engine.load(project);
  d.engine.select([d.rectangle.id]);
  d.mount(<MaterialControl engine={d.engine} run={d.run} />);
  expect(screen.getByRole("button", { name: "Matière" })).toBeDisabled();
  expect(screen.queryByRole("slider", { name: "Rugosité" })).toBeNull();
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});

test("environment previews and release use the existing owned scene transaction; cancellation restores the scene", () => {
  const d = fixture(),
    original = d.engine.getSnapshot().project;
  let renders = 0;
  function Outer() {
    renders++;
    return <EnvironmentControl engine={d.engine} run={d.run} />;
  }
  const view = d.mount(<Outer />),
    before = renders,
    field = control("Intensité");
  act(() => field.onStart?.());
  for (const value of [1.5, 2, 2.5]) act(() => field.onPreview(value));
  expect(renders).toBe(before);
  expect(d.engine.getSnapshot().project).toBe(original);
  expect(d.store.get(previewAtom)).toMatchObject({
    patch: { spatial: { environment: { intensity: 2.5 } } },
  });
  act(() => field.onCommit(2.5));
  expect(d.run).toHaveBeenCalledOnce();
  expect(d.engine.getSnapshot().project.pages[0]!.spatial!.environment.intensity).toBe(2.5);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(original);
  const rotation = control("Rotation");
  act(() => {
    rotation.onStart?.();
    rotation.onPreview(90);
  });
  expect(d.store.get(previewAtom)).not.toBeNull();
  view.unmount();
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.engine.getSnapshot().project).toEqual(original);
});

test("unrelated scene commands cancel an active environment draft and reject its late release", () => {
  const d = fixture();
  d.mount(<EnvironmentControl engine={d.engine} run={d.run} />);
  const stale = control("Intensité");
  act(() => {
    stale.onStart?.();
    stale.onPreview(4);
  });
  act(() => d.engine.execute({ type: "updatePage", patch: { background: "#123456" } }));
  const original = d.engine.getSnapshot().project;
  act(() => stale.onCommit(4));
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.engine.getSnapshot().project).toBe(original);
  expect(d.engine.getSnapshot().project.pages[0]!.spatial!.environment.intensity).toBe(1);
  expect(d.run).not.toHaveBeenCalled();
});

test("direction pad edits the canonical camera and restores both axes with one undo", () => {
  const d = fixture();
  const original = d.engine.getSnapshot().project;
  const camera = original.pages[0]!.spatial!.camera;
  d.mount(<EnvironmentControl engine={d.engine} run={d.run} />);
  fireEvent.keyDown(screen.getByRole("button", { name: "Direction" }), { key: "ArrowRight" });
  expect(d.run).toHaveBeenCalledOnce();
  expect(d.engine.getSnapshot().project.pages[0]!.spatial!.camera).toEqual({
    ...camera,
    yaw: camera.yaw + 1,
  });
  expect(d.store.get(previewAtom)).toBeNull();
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(original);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
