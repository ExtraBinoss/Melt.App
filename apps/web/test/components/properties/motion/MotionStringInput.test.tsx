import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { planMotionInitialization } from "@musart/core";
import { MotionStringInput } from "../../../../src/components/properties/motion/MotionStringInput";
import { createMotionTransport } from "../../../../src/services/motion/transport";
import { setup } from "../../../support/ui";

test("restores a multiline draft on a seek even when the held text value never changes", () => {
  const d = setup(),
    commit = vi.fn(),
    cancel = vi.fn();
  d.engine.execute({
    type: "setCompositionMode",
    mode: "motion",
    plan: planMotionInitialization(d.engine.getSnapshot()),
  });
  const target = { kind: "layer" as const, layerId: d.text.id, property: "text" as const };
  let renders = 0;
  function Harness() {
    renders++;
    return (
      <MotionStringInput
        engine={d.engine}
        target={target}
        value="Bonjour"
        label="Text"
        multiline
        onCommit={commit}
        onCancel={cancel}
      />
    );
  }
  d.mount(<Harness />);
  const field = screen.getByRole("textbox", { name: "Text" });
  fireEvent.change(field, { target: { value: "Uncommitted\ncreation" } });
  expect(field).toHaveValue("Uncommitted\ncreation");
  act(() => createMotionTransport(d.engine).seek({ value: 1, rate: 1 }));
  expect(field).toHaveValue("Bonjour");
  expect(renders).toBe(1);
  fireEvent.blur(field);
  expect(commit).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalled();
});
test("validates native string drafts, cancels Escape and commits one completed edit", () => {
  const d = setup(),
    commit = vi.fn(),
    cancel = vi.fn(),
    preview = vi.fn();
  d.mount(
    <MotionStringInput
      target={{ kind: "layer", layerId: d.rectangle.id, property: "stroke" }}
      value="#123456"
      label="Stroke"
      validate={(value) => /^#[\da-f]{6}$/i.test(value)}
      onPreview={preview}
      onCommit={commit}
      onCancel={cancel}
    />,
  );
  const field = screen.getByLabelText("Stroke");
  fireEvent.change(field, { target: { value: "bad" } });
  fireEvent.blur(field);
  expect(field).toHaveValue("#123456");
  expect(commit).not.toHaveBeenCalled();
  fireEvent.change(field, { target: { value: "#abcdef" } });
  expect(preview).toHaveBeenCalledWith("#abcdef");
  fireEvent.keyDown(field, { key: "Escape" });
  expect(field).toHaveValue("#123456");
  fireEvent.change(field, { target: { value: "#abcdef" } });
  fireEvent.blur(field);
  expect(commit).toHaveBeenCalledExactlyOnceWith("#abcdef");
});

test("coalesces rapid native typing into the next frame and retires pending work on blur, Escape and unmount", () => {
  const d = setup(),
    preview = vi.fn(),
    commit = vi.fn(),
    cancel = vi.fn();
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  const request = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.set(++sequence, callback);
    return sequence;
  });
  const stop = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
  const view = d.mount(
    <MotionStringInput
      value="A"
      label="Text"
      coalescePreview
      target={{ kind: "layer", layerId: d.text.id, property: "text" }}
      onPreview={preview}
      onCommit={commit}
      onCancel={cancel}
    />,
  );
  const field = screen.getByLabelText("Text");
  for (const value of ["AB", "ABC", "ABCD"]) fireEvent.change(field, { target: { value } });
  expect(field).toHaveValue("ABCD");
  expect(preview).not.toHaveBeenCalled();
  expect(frames.size).toBe(1);
  act(() => {
    for (const callback of frames.values()) callback(16);
    frames.clear();
  });
  expect(preview).toHaveBeenCalledExactlyOnceWith("ABCD");
  fireEvent.change(field, { target: { value: "ABCDE" } });
  fireEvent.blur(field);
  expect(frames.size).toBe(0);
  expect(commit).toHaveBeenCalledExactlyOnceWith("ABCDE");
  fireEvent.change(field, { target: { value: "bad" } });
  fireEvent.keyDown(field, { key: "Escape" });
  expect(frames.size).toBe(0);
  fireEvent.change(field, { target: { value: "late" } });
  view.unmount();
  expect(frames.size).toBe(0);
  request.mockRestore();
  stop.mockRestore();
});
