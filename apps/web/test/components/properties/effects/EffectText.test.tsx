import { expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EffectText } from "../../../../src/components/properties/effects/EffectText";
test("text drafts preserve order/spaces, cancel invalid/escaped edits and commit once per completed gesture", () => {
  const identity = {},
    preview = vi.fn(),
    commit = vi.fn(),
    cancel = vi.fn(),
    start = vi.fn();
  const view = render(
    <EffectText
      identity={identity}
      label="Characters"
      value=" .@"
      minLength={1}
      maxLength={64}
      onPreview={preview}
      onCommit={commit}
      onCancel={cancel}
      onStart={start}
    />,
  );
  const input = screen.getByRole("textbox", { name: "Characters" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "" } });
  expect(preview).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: " 01@" } });
  expect(preview).toHaveBeenLastCalledWith(" 01@");
  fireEvent.keyDown(input, { key: "Escape" });
  expect(cancel).toHaveBeenCalledOnce();
  expect(input).toHaveValue(" .@");
  expect(commit).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "@#" } });
  fireEvent.blur(input);
  fireEvent.blur(input);
  expect(commit).toHaveBeenCalledExactlyOnceWith("@#");
  expect(start).toHaveBeenCalledTimes(2);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "stale" } });
  view.rerender(
    <EffectText
      identity={{}}
      label="Characters"
      value="new"
      minLength={1}
      maxLength={64}
      onPreview={preview}
      onCommit={commit}
      onCancel={cancel}
    />,
  );
  expect(input).toHaveValue("new");
  expect(commit).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalledTimes(2);
});
