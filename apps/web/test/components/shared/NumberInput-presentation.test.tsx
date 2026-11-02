import { Profiler } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { NumberInput } from "../../../src/components/shared/NumberInput";
import { i18n } from "../../../src/state/i18n";

beforeEach(async () => {
  await i18n.changeLanguage("fr");
});

function source(initial: number | null) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    read: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish: (next = value) => {
      value = next;
      act(() => {
        for (const listener of listeners) listener();
      });
    },
  };
}

test("scalar publications only write changed native values and placeholders without React commits", () => {
  const presentation = source(1.23456789),
    commit = vi.fn(),
    renders = vi.fn();
  render(
    <Profiler id="field" onRender={renders}>
      <NumberInput label="Live" value={1.23456789} presentation={presentation} onCommit={commit} />
    </Profiler>,
  );
  const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Live" }),
    valueWrite = vi.spyOn(input, "value", "set"),
    placeholderWrite = vi.spyOn(input, "placeholder", "set"),
    before = renders.mock.calls.length;
  input.focus();
  for (let index = 0; index < 8; index++) presentation.publish();
  presentation.publish(1.234568);
  expect(valueWrite).not.toHaveBeenCalled();
  expect(placeholderWrite).not.toHaveBeenCalled();
  fireEvent.blur(input);
  expect(commit).not.toHaveBeenCalled();

  presentation.publish(null);
  expect(input).toHaveValue("");
  expect(valueWrite).toHaveBeenCalledOnce();
  expect(placeholderWrite).toHaveBeenCalledOnce();
  for (let index = 0; index < 8; index++) presentation.publish();
  expect(valueWrite).toHaveBeenCalledOnce();
  expect(placeholderWrite).toHaveBeenCalledOnce();

  presentation.publish(1.234568);
  expect(input).toHaveValue("1.23");
  expect(input.placeholder).toBe("");
  input.value = "external";
  input.placeholder = "external";
  valueWrite.mockClear();
  placeholderWrite.mockClear();
  input.focus();
  presentation.publish();
  expect(valueWrite).toHaveBeenCalledExactlyOnceWith("1.23");
  expect(placeholderWrite).toHaveBeenCalledExactlyOnceWith("");
  expect(input).toHaveFocus();
  expect(renders).toHaveBeenCalledTimes(before);
});

test.each(["typing", "pointer", "key"])(
  "same-value publications cancel an active %s draft before deduplicating DOM writes",
  (kind) => {
    const presentation = source(20),
      cancel = vi.fn(),
      commit = vi.fn(),
      preview = vi.fn();
    render(
      <NumberInput
        label="Live"
        value={20}
        max={20}
        presentation={presentation}
        onCommit={commit}
        onPreview={preview}
        onCancel={cancel}
      />,
    );
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Live" }),
      handle = screen.getByRole("button", { name: "Ajuster Live" });
    input.focus();
    if (kind === "typing") {
      fireEvent.change(input, { target: { value: "19" } });
      fireEvent.change(input, { target: { value: "20" } });
    } else if (kind === "pointer") {
      vi.spyOn(handle, "hasPointerCapture").mockReturnValue(true);
      fireEvent.pointerDown(handle, { button: 0, clientX: 0, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientX: 20, pointerId: 1 });
    } else fireEvent.keyDown(input, { key: "ArrowUp" });
    const valueWrite = vi.spyOn(input, "value", "set"),
      placeholderWrite = vi.spyOn(input, "placeholder", "set"),
      released = vi.spyOn(handle, "releasePointerCapture");
    presentation.publish();
    expect(cancel).toHaveBeenCalledOnce();
    expect(valueWrite).not.toHaveBeenCalled();
    expect(placeholderWrite).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
    if (kind === "pointer") expect(released).toHaveBeenCalledExactlyOnceWith(1);
    const previews = preview.mock.calls.length;
    if (kind === "typing") fireEvent.blur(input);
    else if (kind === "pointer") {
      fireEvent.pointerMove(handle, { clientX: -40, pointerId: 1 });
      fireEvent.pointerUp(handle, { pointerId: 1 });
    } else {
      fireEvent.keyDown(input, { key: "ArrowUp", repeat: true });
      fireEvent.keyUp(input, { key: "ArrowUp" });
    }
    expect(commit).not.toHaveBeenCalled();
    expect(preview).toHaveBeenCalledTimes(previews);
    expect(input).toHaveValue("20");
  },
);
