import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { StudioDirectionPad } from "../../../src/ui/studio/controls/StudioDirectionPad";
import type { StudioDirectionPadProps } from "../../../src/ui/studio/controls/StudioDirectionPad";

function fixture() {
  let invalidate = () => {};
  const props: StudioDirectionPadProps = {
    label: "Direction",
    value: { x: 0, y: 0 },
    minX: -180,
    maxX: 180,
    minY: -89,
    maxY: 89,
    identity: {},
    invalidation: {
      subscribe: (listener) => {
        invalidate = listener;
        return () => {
          invalidate = () => {};
        };
      },
    },
    onStart: vi.fn(),
    onPreview: vi.fn(),
    onCommit: vi.fn(),
    onCancel: vi.fn(),
  };
  const view = render(<StudioDirectionPad {...props} />);
  const pad = screen.getByRole("button", { name: "Direction" });
  const measure = vi.spyOn(pad, "getBoundingClientRect").mockReturnValue({
    left: 20,
    top: 10,
    width: 200,
    height: 100,
  } as DOMRect);
  const pointer = (
    name: "pointerDown" | "pointerMove" | "pointerUp",
    x: number,
    y: number,
    button = 0,
  ) => {
    fireEvent[name](pad, { button, clientX: x, clientY: y, pointerId: 1 });
  };
  return { props, view, pad, measure, pointer, invalidate: () => act(invalidate) };
}

test("direction drag caches geometry, previews both axes and commits one final bounded value", () => {
  const d = fixture();
  d.pointer("pointerDown", 120, 60);
  d.pointer("pointerMove", 170, 35);
  expect(d.props.onPreview).toHaveBeenLastCalledWith({ x: 90, y: 45 });
  expect(d.props.onCommit).not.toHaveBeenCalled();
  d.pointer("pointerUp", 500, -10);
  expect(d.props.onCommit).toHaveBeenCalledExactlyOnceWith({ x: 180, y: 89 });
  expect(d.measure).toHaveBeenCalledOnce();
  expect(d.props.onStart).toHaveBeenCalledOnce();
  expect(d.props.onCancel).not.toHaveBeenCalled();
});

test("secondary input is ignored and cancellation rejects late release", () => {
  const d = fixture();
  d.pointer("pointerDown", 120, 60, 2);
  expect(d.props.onStart).not.toHaveBeenCalled();
  d.pointer("pointerDown", 120, 60);
  fireEvent.keyDown(d.pad, { key: "Escape" });
  d.pointer("pointerUp", 220, 10);
  expect(d.props.onCancel).toHaveBeenCalledOnce();
  expect(d.props.onCommit).not.toHaveBeenCalled();
});

test("time invalidation, owner replacement and unmount retire active drafts", () => {
  const d = fixture();
  d.pointer("pointerDown", 120, 60);
  d.invalidate();
  d.pointer("pointerUp", 220, 10);
  expect(d.props.onCommit).not.toHaveBeenCalled();
  expect(d.props.onCancel).toHaveBeenCalledOnce();
  d.pointer("pointerDown", 120, 60);
  d.view.rerender(<StudioDirectionPad {...d.props} identity={{}} />);
  expect(d.props.onCancel).toHaveBeenCalledTimes(2);
  d.pointer("pointerDown", 120, 60);
  d.view.unmount();
  expect(d.props.onCancel).toHaveBeenCalledTimes(3);
});

test("keyboard arrows use the same preview and atomic commit with adjustable precision", () => {
  const d = fixture();
  fireEvent.keyDown(d.pad, { key: "ArrowRight", shiftKey: true });
  expect(d.props.onPreview).toHaveBeenLastCalledWith({ x: 10, y: 0 });
  expect(d.props.onCommit).toHaveBeenLastCalledWith({ x: 10, y: 0 });
  expect(d.props.onStart).toHaveBeenCalledOnce();
});
