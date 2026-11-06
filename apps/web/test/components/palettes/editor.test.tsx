import { useState } from "react";
import type { PaletteSwatch, SavedPalette } from "@musart/core";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useShortcuts } from "../../../src/state/session/shortcuts";
import { PaletteProvider } from "../../../src/components/palettes/PaletteProvider";
import { PaletteEditor } from "../../../src/components/palettes/PaletteEditor";
import { i18n } from "../../../src/state/i18n";
import { setup } from "../../support/ui";
import "../../../src/components/palettes/messages";

const original: PaletteSwatch[] = [
  { id: "brand", name: "Brand", value: "#5130a8" },
  { id: "locked", name: "Anchor", value: "#ff440080", locked: true },
];
const label = (key: string) => i18n.t(key, { ns: "palettes" });
const button = (key: string) => screen.getByRole("button", { name: label(key), exact: true });
function mountEditor(id = "saved") {
  const callbacks = {
    save: vi.fn(),
    preview: vi.fn(),
    cancel: vi.fn(),
    apply: vi.fn(),
    close: vi.fn(),
  };
  function Editor() {
    const [palette, setPalette] = useState<SavedPalette>({ id, name: "Brand", colors: original });
    const [preview, setPreview] = useState<PaletteSwatch[] | null>(null);
    return (
      <PaletteEditor
        palette={palette}
        value="#336699"
        busy={false}
        preview={preview}
        onChange={setPalette}
        onSave={callbacks.save}
        onClose={callbacks.close}
        onApplyVariation={callbacks.apply}
        onPreview={(colors) => {
          callbacks.preview(colors);
          setPreview(colors);
        }}
        onCancelPreview={() => {
          callbacks.cancel();
          setPreview(null);
        }}
      />
    );
  }
  setup().mount(<Editor />);
  return callbacks;
}
const colorField = () => screen.getByRole("textbox", { name: label("colorValue") });
afterEach(() => vi.restoreAllMocks());

it.each(["saved", "new"])(
  "reverses repeated %s palette generations locally before one apply",
  (id) => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0.2).mockReturnValueOnce(0.7);
    const callbacks = mountEditor(id);
    fireEvent.click(button("dice"));
    const first = callbacks.preview.mock.calls[0]![0] as PaletteSwatch[];
    fireEvent.click(button("dice"));
    const second = callbacks.preview.mock.calls[1]![0] as PaletteSwatch[];
    expect(second[0]!.value).not.toBe(first[0]!.value);
    expect(first[1]).toEqual(original[1]);
    expect(second[1]).toEqual(original[1]);
    expect(callbacks.apply).not.toHaveBeenCalled();
    expect(callbacks.save).not.toHaveBeenCalled();
    fireEvent.click(button("historyUndo"));
    expect(colorField()).toHaveValue(first[0]!.value);
    fireEvent.keyDown(button("dice"), { key: "z", ctrlKey: true });
    expect(colorField()).toHaveValue(original[0]!.value);
    expect(callbacks.cancel).toHaveBeenCalledOnce();
    fireEvent.keyDown(button("dice"), { key: "z", metaKey: true, shiftKey: true });
    expect(colorField()).toHaveValue(first[0]!.value);
    fireEvent.keyDown(button("dice"), { key: "y", ctrlKey: true });
    expect(colorField()).toHaveValue(second[0]!.value);
    fireEvent.click(button("apply"));
    expect(callbacks.apply).toHaveBeenCalledExactlyOnceWith(second);
  },
);
it("drops forward generations on a new branch and cancel restores the original draft", () => {
  vi.spyOn(Math, "random").mockReturnValue(0.4);
  const callbacks = mountEditor();
  fireEvent.click(button("dice"));
  fireEvent.click(button("dice"));
  fireEvent.click(button("historyUndo"));
  fireEvent.click(button("dice"));
  expect(button("historyRedo")).toBeDisabled();
  fireEvent.click(button("cancel"));
  expect(colorField()).toHaveValue(original[0]!.value);
  expect(button("historyUndo")).toBeDisabled();
  expect(button("historyRedo")).toBeDisabled();
  expect(callbacks.cancel).toHaveBeenCalledOnce();
  expect(button("back")).toBeEnabled();
});
it("shows malformed hex inline and prevents saving or generating until corrected", () => {
  const callbacks = mountEditor();
  fireEvent.change(colorField(), { target: { value: "#5130A8teste" } });
  expect(colorField()).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("alert")).toHaveTextContent(label("invalidColor"));
  expect(button("update")).toBeDisabled();
  expect(button("dice")).toBeDisabled();
  fireEvent.click(button("update"));
  fireEvent.click(button("dice"));
  expect(callbacks.save).not.toHaveBeenCalled();
  expect(callbacks.preview).not.toHaveBeenCalled();
  fireEvent.change(colorField(), { target: { value: "#5130A8" } });
  expect(colorField()).not.toHaveAttribute("aria-invalid");
  expect(button("update")).toBeEnabled();
  expect(button("dice")).toBeEnabled();
  fireEvent.click(button("update"));
  expect(callbacks.save.mock.calls[0]![0].colors[0].value).toBe("#5130A8");
});
it("opens the existing color picker from a swatch and validates its hex input", () => {
  mountEditor();
  fireEvent.click(
    screen.getByRole("button", {
      name: i18n.t("chooseColor", { ns: "palettes", name: "Brand", value: "#5130a8" }),
    }),
  );
  const popover = screen.getByRole("dialog");
  expect(popover.querySelector(".color-channels")).toBeInTheDocument();
  expect(popover.querySelector(".palette-shortcut")).toBeNull();
  const input = popover.querySelector<HTMLInputElement>(".color-value input")!;
  fireEvent.change(input, { target: { value: "#5130A8teste" } });
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("alert")).toHaveTextContent(label("invalidColor"));
  expect(button("update")).toBeDisabled();
  expect(button("dice")).toBeDisabled();
  fireEvent.change(input, { target: { value: "#336699" } });
  fireEvent.keyUp(input, { key: "Enter" });
  expect(colorField()).toHaveValue("#336699");
  expect(button("update")).toBeEnabled();
});
it("keeps editable text undo available without rewinding generated colors", () => {
  const callbacks = mountEditor();
  fireEvent.click(button("dice"));
  const calls = callbacks.preview.mock.calls.length;
  fireEvent.keyDown(screen.getByRole("textbox", { name: label("name") }), {
    key: "z",
    ctrlKey: true,
  });
  expect(callbacks.preview).toHaveBeenCalledTimes(calls);
  expect(callbacks.cancel).not.toHaveBeenCalled();
});

it("falls back to document buttons and keyboard history after Apply resets the generation draft", () => {
  const d = setup(),
    before = d.engine.getSnapshot().project;
  function Editor() {
    useShortcuts(d.engine, d.services, d.onTask);
    const [palette, setPalette] = useState<SavedPalette>({
      id: "saved",
      name: "Brand",
      colors: original,
    });
    const [preview, setPreview] = useState<PaletteSwatch[] | null>(null);
    return (
      <PaletteProvider engine={d.engine}>
        <div data-slot="popover-content" data-canvas-control="palette">
          <PaletteEditor
            key={palette.id}
            palette={palette}
            value="#336699"
            busy={false}
            preview={preview}
            onChange={setPalette}
            onSave={vi.fn()}
            onClose={vi.fn()}
            onApplyVariation={(colors) => {
              d.engine.execute({
                type: "updateLayers",
                ids: [d.rectangle.id],
                patch: { fill: colors[0]!.value },
              });
              setPreview(null);
              setPalette({ ...palette, id: "applied", colors });
            }}
            onPreview={setPreview}
            onCancelPreview={() => setPreview(null)}
          />
        </div>
      </PaletteProvider>
    );
  }
  d.mount(<Editor />);
  fireEvent.click(button("dice"));
  fireEvent.click(button("dice"));
  expect(d.engine.getSnapshot().project).toBe(before);
  fireEvent.click(button("apply"));
  const applied = d.engine.getSnapshot().project;
  expect(applied).not.toBe(before);
  expect(button("historyUndo")).toBeEnabled();
  fireEvent.click(button("historyUndo"));
  expect(d.engine.getSnapshot().project).toEqual(before);
  expect(button("historyRedo")).toBeEnabled();
  fireEvent.click(button("historyRedo"));
  expect(d.engine.getSnapshot().project).toEqual(applied);
  fireEvent.keyDown(button("dice"), { key: "z", ctrlKey: true });
  expect(d.engine.getSnapshot().project).toEqual(before);
  fireEvent.keyDown(button("dice"), { key: "z", ctrlKey: true, shiftKey: true });
  expect(d.engine.getSnapshot().project).toEqual(applied);
});
