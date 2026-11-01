import type { ComponentProps } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { createEffect } from "@musart/core";
import type { GradientStopRow } from "../../../../src/components/properties/gradient/GradientStopRow";
import { Inspector } from "../../../../src/components/properties/Inspector";
import { previewAtom, useEngine } from "../../../../src/state/session/editor";
import { setup } from "../../../support/ui";

const observed = vi.hoisted(() => ({ row: vi.fn() }));
vi.mock("../../../../src/components/properties/gradient/GradientStopRow", async (original) => {
  const actual = await original<{ GradientStopRow: typeof GradientStopRow }>();
  return {
    ...actual,
    GradientStopRow: (props: ComponentProps<typeof GradientStopRow>) => {
      observed.row();
      return <actual.GradientStopRow {...props} />;
    },
  };
});

function mount() {
  const d = setup();
  d.engine.execute({
    type: "updatePage",
    patch: {
      background: "#ff0000",
      backgroundGradient: {
        kind: "linear",
        angle: 0,
        stops: [
          { offset: 0, color: "#ff0000" },
          { offset: 1, color: "#ffffff" },
        ],
      },
    },
  });
  function Live() {
    const snapshot = useEngine(d.engine),
      page = snapshot.project.pages[0]!;
    return (
      <Inspector
        engine={d.engine}
        page={page}
        assets={snapshot.project.assets}
        selected={[]}
        run={d.run}
      />
    );
  }
  d.mount(<Live />);
  return d;
}

test("real background stop rows do not render for visibility, transform or effect history and callbacks stay current", () => {
  const d = mount(),
    field = screen.getByLabelText("Couleur hexadécimale du point 1");
  observed.row.mockClear();
  act(() =>
    d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { visible: false } }),
  );
  act(() => d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { x: 60 } }));
  act(() =>
    d.engine.execute({
      type: "updateLayers",
      ids: [d.rectangle.id],
      patch: { effects: [createEffect("contrast")] },
    }),
  );
  act(() => d.engine.undo());
  act(() => d.engine.redo());
  expect(observed.row).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Couleur hexadécimale du point 1")).toBe(field);
  fireEvent.change(field, { target: { value: "#123456" } });
  fireEvent.blur(field);
  expect(d.engine.getSnapshot().project.pages[0]!.backgroundGradient!.stops[0]!.color).toBe(
    "#123456",
  );
  expect(d.run).toHaveBeenCalledTimes(1);
  act(() => d.engine.undo());
  expect(field).toHaveValue("#FF0000");
  act(() => d.engine.redo());
  expect(field).toHaveValue("#123456");
});

test("unrelated canonical visibility cancels an active angle draft and late blur cannot commit it", () => {
  const d = mount(),
    angle = screen.getByRole("textbox", { name: "Angle du dégradé" });
  act(() => angle.focus());
  fireEvent.change(angle, { target: { value: "45" } });
  expect(d.store.get(previewAtom)).toMatchObject({ patch: { backgroundGradient: { angle: 45 } } });
  observed.row.mockClear();
  act(() =>
    d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { visible: false } }),
  );
  expect(d.store.get(previewAtom)).toBeNull();
  expect(angle).toHaveValue("0");
  expect(observed.row).not.toHaveBeenCalled();
  fireEvent.blur(angle);
  expect(d.run).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot().project.pages[0]!.backgroundGradient!.angle).toBe(0);
});

test("ordinary rulers preserve a focused stop draft while ruler history invalidates it", () => {
  const d = mount(),
    field = screen.getByLabelText("Couleur hexadécimale du point 1");
  act(() => field.focus());
  fireEvent.change(field, { target: { value: "#123456" } });
  observed.row.mockClear();
  act(() => d.engine.execute({ type: "updatePage", patch: { rulers: true } }));
  expect(d.store.get(previewAtom)).toMatchObject({
    patch: { backgroundGradient: { stops: [{ color: "#123456" }, { color: "#ffffff" }] } },
  });
  expect(observed.row).not.toHaveBeenCalled();
  fireEvent.blur(field);
  expect(d.engine.getSnapshot().project.pages[0]!.backgroundGradient!.stops[0]!.color).toBe(
    "#123456",
  );
  act(() => field.focus());
  fireEvent.change(field, { target: { value: "#abcdef" } });
  act(() => d.engine.execute({ type: "updatePage", patch: { rulers: false } }));
  expect(field).toHaveValue("#abcdef");
  act(() => d.engine.undo());
  expect(d.store.get(previewAtom)).toBeNull();
  expect(field).toHaveValue("#123456");
  fireEvent.blur(field);
  expect(d.run).toHaveBeenCalledTimes(1);
});

test("same-ID load disposes a dirty background owner and rejects its late release", () => {
  const d = mount(),
    field = screen.getByLabelText("Couleur hexadécimale du point 1");
  const project = structuredClone(d.engine.getSnapshot().project);
  act(() => field.focus());
  fireEvent.change(field, { target: { value: "#abcdef" } });
  act(() => d.engine.load(project));
  expect(field.isConnected).toBe(false);
  expect(d.store.get(previewAtom)).toBeNull();
  expect(screen.getByLabelText("Couleur hexadécimale du point 1")).toHaveValue("#FF0000");
  fireEvent.blur(field);
  expect(d.engine.getSnapshot().project).toEqual(project);
  expect(d.run).not.toHaveBeenCalled();
});

test("idle solid/gradient switches reuse unchanged editor elements and preserve canonical undo", async () => {
  const d = mount(),
    field = screen.getByLabelText("Couleur hexadécimale du point 1"),
    original = d.engine.getSnapshot().project.pages[0]!.backgroundGradient;
  observed.row.mockClear();
  for (let index = 0; index < 3; index++) {
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Uni" })));
    expect(d.engine.getSnapshot().project.pages[0]!.backgroundGradient).toBeUndefined();
    expect(field.isConnected).toBe(true);
    expect(field).not.toBeVisible();
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Dégradé" })));
    expect(d.engine.getSnapshot().project.pages[0]!.backgroundGradient).toEqual(original);
    expect(screen.getByLabelText("Couleur hexadécimale du point 1")).toBe(field);
    expect(field).toBeVisible();
  }
  expect(observed.row).not.toHaveBeenCalled();
  expect(d.run).toHaveBeenCalledTimes(6);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project.pages[0]!.backgroundGradient).toBeUndefined();
  act(() => d.engine.redo());
  expect(d.engine.getSnapshot().project.pages[0]!.backgroundGradient).toEqual(original);
  fireEvent.change(field, { target: { value: "#123456" } });
  fireEvent.blur(field);
  expect(d.engine.getSnapshot().project.pages[0]!.backgroundGradient!.stops[0]!.color).toBe(
    "#123456",
  );
});

test("retained paint follows exact authored angle and current stop values after mode changes", async () => {
  const d = mount();
  await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Uni" })));
  const paint = {
    kind: "linear" as const,
    angle: 360,
    stops: [
      { offset: 0, color: "#abcdef80" },
      { offset: 1, color: "#ffffff" },
    ],
  };
  act(() => d.engine.execute({ type: "updatePage", patch: { backgroundGradient: paint } }));
  expect(screen.getByRole("textbox", { name: "Angle du dégradé" })).toHaveValue("360");
  expect(screen.getByLabelText("Couleur hexadécimale du point 1")).toHaveValue("#ABCDEF");
  const angle = screen.getByRole("textbox", { name: "Angle du dégradé" });
  fireEvent.change(angle, { target: { value: "361" } });
  fireEvent.blur(angle);
  expect(d.engine.getSnapshot().project.pages[0]!.backgroundGradient!.angle).toBe(361);
  act(() => d.engine.undo());
  expect(angle).toHaveValue("360");
});
