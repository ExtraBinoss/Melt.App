import { useRef } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useHoverDismiss } from "../../../../src/components/shared/overlays/use-hover-dismiss";
import { setup } from "../../../support/ui";

test("hover exit grace cancels on reentry, keyboard use and disposal; non-primary drags do not dismiss", () => {
  vi.useFakeTimers();
  const close = vi.fn();
  function Surface() {
    const root = useRef<HTMLDivElement>(null);
    const hover = useHoverDismiss(true, close, root);
    return (
      <div
        ref={root}
        onPointerEnter={hover.enter}
        onPointerLeave={hover.leave}
        onKeyDownCapture={hover.cancel}
      >
        Surface
      </div>
    );
  }
  const d = setup();
  const mounted = d.mount(<Surface />);
  const node = screen.getByText("Surface");
  function pointer(type: string, buttons = 0) {
    const event = new MouseEvent(type, { bubbles: true, buttons });
    Object.defineProperty(event, "pointerType", { value: "mouse" });
    fireEvent(node, event);
  }
  try {
    pointer("pointerout");
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(close).not.toHaveBeenCalled();
    pointer("pointerover");
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(close).not.toHaveBeenCalled();
    pointer("pointerout");
    fireEvent.keyDown(node, { key: "ArrowDown" });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(close).not.toHaveBeenCalled();
    pointer("pointerout", 1);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(close).not.toHaveBeenCalled();
    pointer("pointerout");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(close).toHaveBeenCalledOnce();
    pointer("pointerout");
    mounted.unmount();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(close).toHaveBeenCalledOnce();
  } finally {
    mounted.unmount();
    vi.useRealTimers();
  }
});
