import type { ComponentProps } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { createSpatialScene } from "@musart/core";
import type { SceneNumberInput } from "../../../src/components/spatial/SceneNumberInput";
import { SpatialSceneProperties } from "../../../src/components/spatial/SpatialSceneProperties";
import { previewAtom, useEngine } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";

const observed = vi.hoisted(() => ({ number: vi.fn() }));
vi.mock("../../../src/components/spatial/SceneNumberInput", async (original) => {
  const actual = await original<{ SceneNumberInput: typeof SceneNumberInput }>();
  return {
    ...actual,
    SceneNumberInput: (props: ComponentProps<typeof SceneNumberInput>) => {
      observed.number(props);
      return <actual.SceneNumberInput {...props} />;
    },
  };
});

function mount() {
  const d = setup();
  d.engine.execute({ type: "updatePage", patch: { spatial: createSpatialScene() } });
  d.engine.load(d.engine.getSnapshot().project);
  function Live() {
    const snapshot = useEngine(d.engine),
      page = snapshot.project.pages[0]!;
    return <SpatialSceneProperties engine={d.engine} page={page} run={d.run} />;
  }
  d.mount(<Live />);
  return d;
}

function intensityCallbacks() {
  return [...observed.number.mock.calls]
    .reverse()
    .find(([props]) => props.label === "Intensité")![0] as ComponentProps<typeof SceneNumberInput>;
}

test("unchanged spatial controls survive background commands and edit the fresh canonical page", () => {
  const d = mount(),
    field = screen.getByRole("textbox", { name: "Intensité" });
  observed.number.mockClear();
  act(() => d.engine.execute({ type: "updatePage", patch: { background: "#123456" } }));
  act(() => d.engine.undo());
  act(() => d.engine.redo());
  expect(observed.number).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "Intensité" })).toBe(field);
  fireEvent.change(field, { target: { value: "2.5" } });
  expect(d.engine.getSnapshot().project.pages[0]!.spatial!.environment.intensity).not.toBe(2.5);
  expect(d.store.get(previewAtom)).toMatchObject({
    patch: { spatial: { environment: { intensity: 2.5 } } },
  });
  fireEvent.blur(field);
  expect(d.engine.getSnapshot().project.pages[0]!.spatial!.environment.intensity).toBe(2.5);
  expect(d.engine.getSnapshot().project.pages[0]!.background).toBe("#123456");
  expect(d.run).toHaveBeenCalledTimes(1);
  act(() => d.engine.undo());
  expect(field).toHaveValue("1");
});

test("unrelated canonical edits cancel an active scene draft and its late blur", () => {
  const d = mount(),
    field = screen.getByRole("textbox", { name: "Intensité" });
  fireEvent.change(field, { target: { value: "3" } });
  expect(d.store.get(previewAtom)).not.toBeNull();
  act(() => d.engine.execute({ type: "updatePage", patch: { background: "#654321" } }));
  expect(d.store.get(previewAtom)).toBeNull();
  expect(field).toHaveValue("1");
  fireEvent.blur(field);
  expect(d.run).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot().project.pages[0]!.spatial!.environment.intensity).toBe(1);
});

test("same-ID loads and selection changes retire previous control callbacks", () => {
  const d = mount(),
    stale = intensityCallbacks(),
    field = screen.getByRole("textbox", { name: "Intensité" });
  fireEvent.change(field, { target: { value: "3" } });
  const project = structuredClone(d.engine.getSnapshot().project);
  act(() => d.engine.load(project));
  expect(field.isConnected).toBe(false);
  act(() => {
    stale.onStart?.();
    stale.onPreview?.(4);
    stale.onCommit(4);
  });
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.run).not.toHaveBeenCalled();
  const beforeSelection = intensityCallbacks();
  act(() => d.engine.select([d.rectangle.id]));
  act(() => {
    beforeSelection.onStart?.();
    beforeSelection.onCommit(5);
  });
  expect(d.run).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot().project.pages[0]!.spatial!.environment.intensity).toBe(1);
});

test("spatial settings replacement retires stale payload callbacks and resets unchanged active fields", () => {
  const d = mount(),
    stale = intensityCallbacks(),
    field = screen.getByRole("textbox", { name: "Intensité" }),
    previous = d.engine.getSnapshot().project.pages[0]!.spatial!;
  fireEvent.change(field, { target: { value: "3" } });
  expect(d.store.get(previewAtom)).not.toBeNull();
  const replacement = { ...previous, environment: { ...previous.environment, rotation: 45 } };
  act(() => d.engine.execute({ type: "updatePage", patch: { spatial: replacement } }));
  expect(field).toHaveValue("1");
  expect(d.store.get(previewAtom)).toBeNull();
  act(() => {
    stale.onStart?.();
    stale.onPreview?.(4);
    stale.onCommit(4);
  });
  fireEvent.blur(field);
  expect(d.engine.getSnapshot().project.pages[0]!.spatial).toEqual(replacement);
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.run).not.toHaveBeenCalled();
  fireEvent.change(field, { target: { value: "2.5" } });
  fireEvent.blur(field);
  expect(d.engine.getSnapshot().project.pages[0]!.spatial!.environment).toMatchObject({
    intensity: 2.5,
    rotation: 45,
  });
  expect(d.run).toHaveBeenCalledTimes(1);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project.pages[0]!.spatial).toEqual(replacement);
});
