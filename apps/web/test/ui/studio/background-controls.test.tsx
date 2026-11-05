import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { createEffect } from "@musart/core";
import { StudioBackground } from "../../../src/ui/studio/background/StudioBackground";
import { createBackgroundLayer } from "../../../src/ui/studio/background/model";
import { previewAtom } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";

function fixture(layer = false) {
  const d = setup();
  if (layer) {
    const background = createBackgroundLayer(d.engine, "Background");
    d.engine.execute({
      type: "updateLayers",
      ids: [background.id],
      patch: {
        effects: [createEffect("grain"), createEffect("feather")],
        fillGradient: {
          kind: "radial",
          angle: 0,
          stops: [
            { offset: 0, color: "#AABBCC" },
            { offset: 1, color: "#112233" },
          ],
        },
      },
    });
  } else
    d.engine.execute({
      type: "updatePage",
      patch: {
        background: "#00000000",
        backgroundGradient: {
          kind: "radial",
          angle: 0,
          stops: [
            { offset: 0, color: "#AABBCC" },
            { offset: 1, color: "#112233" },
          ],
        },
      },
    });
  d.engine.load(d.engine.getSnapshot().project);
  d.mount(<StudioBackground engine={d.engine} onTask={d.onTask} />);
  act(() => screen.getByRole("button", { name: "Arrière-plan" }).click());
  const pad = screen.getByRole("button", { name: "Position du dégradé" });
  vi.spyOn(pad, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 100,
  } as DOMRect);
  return { ...d, pad };
}

test.each([false, true])(
  "background pad previews ordinary paint and commits one reversible edit (layer=%s)",
  (layer) => {
    const d = fixture(layer);
    const before = d.engine.getSnapshot().project;
    const revision = d.engine.getSnapshot().revision;
    fireEvent.pointerDown(d.pad, { button: 0, pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(d.pad, { pointerId: 1, clientX: 160, clientY: 30 });
    expect(d.engine.getSnapshot().project).toBe(before);
    const draft = d.store.get(previewAtom)!;
    expect(draft.target).toBe(layer ? "layer" : "page");
    const paint =
      draft.target === "page"
        ? draft.patch.backgroundGradient
        : draft.target === "layer"
          ? draft.patch.fillGradient
          : undefined;
    expect(paint?.centerX).toBeCloseTo(0.8);
    expect(paint?.centerY).toBeCloseTo(0.3);
    fireEvent.pointerUp(d.pad, { button: 0, pointerId: 1, clientX: 160, clientY: 30 });
    expect(d.store.get(previewAtom)).toBeNull();
    expect(d.engine.getSnapshot().revision).toBe(revision + 1);
    if (layer)
      expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects).toEqual(
        before.pages[0]!.layers[0]!.effects,
      );
    act(() => d.engine.undo());
    expect(d.engine.getSnapshot().project).toEqual(before);
  },
);

test("background cancellation restores its draft and solid mode uses a visible gradient color", () => {
  const d = fixture();
  const before = d.engine.getSnapshot().project;
  fireEvent.pointerDown(d.pad, { button: 0, pointerId: 1, clientX: 100, clientY: 50 });
  fireEvent.pointerMove(d.pad, { pointerId: 1, clientX: 160, clientY: 30 });
  fireEvent.keyDown(d.pad, { key: "Escape" });
  fireEvent.pointerUp(d.pad, { button: 0, pointerId: 1, clientX: 160, clientY: 30 });
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.engine.getSnapshot().project).toBe(before);
  act(() => screen.getByRole("button", { name: "Arrière-plan" }).click());
  act(() => screen.getByRole("button", { name: "Uni" }).click());
  expect(d.engine.getSnapshot().project.pages[0]).toMatchObject({ background: "#AABBCC" });
  expect(d.engine.getSnapshot().project.pages[0]!.backgroundGradient).toBeUndefined();
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before);
  act(() => screen.getByRole("button", { name: "Transparent" }).click());
  expect(d.engine.getSnapshot().project.pages[0]).toMatchObject({ background: "#00000000" });
});

test("background recipes belong to the existing Advanced paint Presets popover", () => {
  fixture();
  expect(document.querySelector("[data-background-preset]")).toBeNull();
  act(() => screen.getByRole("button", { name: "Avancé" }).click());
  expect(document.querySelector("[data-background-preset]")).toBeNull();
  act(() => screen.getByRole("button", { name: "Préréglages" }).click());
  expect(document.querySelectorAll("[data-background-preset]")).toHaveLength(65);
  expect(document.querySelector(".gradient-library [data-slot=accordion]")).not.toBeNull();
});

test("switching radial and linear repeatedly gives each pad a live captured thumb and one commit", () => {
  const d = fixture();
  for (const kind of ["Linéaire", "Radial", "Linéaire"]) {
    fireEvent.click(screen.getByRole("button", { name: kind, exact: true }));
    const pad = screen.getByRole("button", {
      name: kind === "Radial" ? "Position du dégradé" : "Angle du dégradé",
    });
    vi.spyOn(pad, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    } as DOMRect);
    const before = d.engine.getSnapshot().revision;
    fireEvent.pointerDown(pad, { button: 0, pointerId: 1, clientX: 90, clientY: 50 });
    fireEvent.pointerMove(pad, { pointerId: 1, clientX: 50, clientY: 10 });
    expect(
      parseFloat(pad.querySelector<HTMLElement>(".studio-direction-position")!.style.top),
    ).toBeCloseTo(kind === "Radial" ? 10 : 0);
    expect(d.engine.getSnapshot().revision).toBe(before);
    fireEvent.pointerUp(pad, { button: 0, pointerId: 1, clientX: 50, clientY: 10 });
    expect(d.engine.getSnapshot().revision).toBe(before + 1);
    expect(d.store.get(previewAtom)).toBeNull();
  }
});
