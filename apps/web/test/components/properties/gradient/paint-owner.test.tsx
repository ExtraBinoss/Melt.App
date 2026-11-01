import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Inspector } from "../../../../src/components/properties/Inspector";
import { previewAtom, useEngine } from "../../../../src/state/session/editor";
import { setup } from "../../../support/ui";

function mountInspector() {
  const data = setup();
  function Live() {
    const snapshot = useEngine(data.engine);
    return (
      <Inspector
        engine={data.engine}
        page={snapshot.project.pages[0]!}
        selected={[]}
        run={data.run}
      />
    );
  }
  data.mount(<Live />);
  return data;
}

test("background panes have distinct React keys through genuine mode activations", () => {
  const errors = vi.spyOn(console, "error");
  try {
    mountInspector();
    for (const name of ["Dégradé", "Uni", "Dégradé", "Uni"]) {
      fireEvent.click(screen.getByRole("radio", { name }));
    }
    expect(
      errors.mock.calls.filter((args) => /same key|unique.*key/i.test(args.join(" "))),
    ).toEqual([]);
  } finally {
    errors.mockRestore();
  }
});

test("same-ID load disposes both visited panes and cancels an active background draft", () => {
  const data = mountInspector();
  fireEvent.click(screen.getByRole("radio", { name: "Dégradé" }));
  const oldGradient = screen.getByRole("textbox", { name: "Angle du dégradé" });
  fireEvent.click(screen.getByRole("radio", { name: "Uni" }));
  const oldColor = screen.getByLabelText("Couleur hexadécimale");
  const project = structuredClone(data.engine.getSnapshot().project);
  act(() => oldColor.focus());
  fireEvent.change(oldColor, { target: { value: "#abcdef" } });
  expect(data.store.get(previewAtom)).not.toBeNull();
  act(() => data.engine.load(project));
  expect(oldColor.isConnected).toBe(false);
  expect(oldGradient.isConnected).toBe(false);
  expect(data.store.get(previewAtom)).toBeNull();
  const current = screen.getByLabelText("Couleur hexadécimale");
  expect(current).not.toBe(oldColor);
  expect(current).toHaveValue(project.pages[0]!.background.toUpperCase());
  fireEvent.pointerUp(oldColor);
  expect(data.engine.getSnapshot().project).toEqual(project);
  expect(data.engine.getSnapshot().canUndo).toBe(false);
});
