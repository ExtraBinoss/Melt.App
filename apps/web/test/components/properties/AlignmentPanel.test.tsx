import { expect, test, vi } from "vitest";
import { act, screen, fireEvent } from "@testing-library/react";
import { AlignmentPanel } from "../../../src/components/properties/AlignmentPanel";
import { setup } from "../../support/ui";
const renders = vi.hoisted(() => ({ icon: vi.fn() }));
vi.mock("../../../src/components/shared/IconButton", async (original) => {
  const module = await original<typeof import("../../../src/components/shared/IconButton")>();
  return {
    IconButton: (props: Parameters<typeof module.IconButton>[0]) => {
      renders.icon(props.label);
      return <module.IconButton {...props} />;
    },
  };
});
test("chooses the reference implicitly and executes real alignment/distribution commands", () => {
  const d = setup();
  const selected = [d.rectangle, d.text, d.image];
  d.mount(<AlignmentPanel engine={d.engine} selected={selected} run={d.run} />);
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(
    screen.getByRole("group", { name: "Alignement horizontal" }).querySelectorAll("button"),
  ).toHaveLength(4);
  expect(
    screen.getByRole("group", { name: "Alignement vertical" }).querySelectorAll("button"),
  ).toHaveLength(4);
  expect(screen.getByRole("region", { name: "Aligner dans la sélection" })).toBeVisible();
  fireEvent.click(screen.getByLabelText("Aligner à gauche de la référence"));
  expect(d.run).toHaveBeenCalledOnce();
  const xs = d.engine.getSnapshot().project.pages[0]!.layers.map((layer) => layer.x);
  expect(new Set(xs).size).toBe(1);
  fireEvent.click(screen.getByLabelText("Répartir horizontalement"));
  fireEvent.click(screen.getByLabelText("Répartir verticalement"));
  expect(d.engine.getSnapshot().canUndo).toBe(true);
});

test("artwork undo/redo retains alignment controls, current IDs and queued owner guards", () => {
  const d = setup();
  let selectedId = d.rectangle.id;
  let pending: (() => void) | undefined;
  const props = () => {
    const origin = d.engine.getSnapshot();
    return {
      engine: d.engine,
      selected: origin.project.pages[0]!.layers.filter((layer) => layer.id === selectedId),
      run: (action: () => void) => {
        pending = () => {
          if (d.engine.getSnapshot() === origin) action();
        };
      },
    };
  };
  renders.icon.mockClear();
  const view = d.mount(<AlignmentPanel {...props()} />);
  const left = screen.getByRole("button", { name: "Aligner à gauche de la référence" });
  left.focus();
  act(() => d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { x: 73 } }));
  view.rerender(<AlignmentPanel {...props()} />);
  act(() => d.engine.undo());
  view.rerender(<AlignmentPanel {...props()} />);
  act(() => d.engine.redo());
  view.rerender(<AlignmentPanel {...props()} />);
  expect(renders.icon).toHaveBeenCalledTimes(8);
  expect(document.activeElement).toBe(left);
  expect(screen.getByRole("button", { name: "Aligner à gauche de la référence" })).toBe(left);

  fireEvent.click(left);
  act(() => d.engine.execute({ type: "renameProject", name: "Later document" }));
  const before = d.engine.getSnapshot();
  pending!();
  expect(d.engine.getSnapshot()).toBe(before);

  selectedId = d.text.id;
  view.rerender(<AlignmentPanel {...props()} />);
  expect(renders.icon).toHaveBeenCalledTimes(16);
  fireEvent.click(left);
  act(() => pending!());
  const aligned = d.engine.getSnapshot().project.pages[0]!.layers;
  expect(aligned[0]!.x).toBe(73);
  expect(aligned[1]!.x).toBe(0);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project.pages[0]!.layers[1]!.x).toBe(30);
});
