import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ScrollShadow } from "../../../../src/components/shared/scroll/ScrollShadow";

afterEach(() => vi.unstubAllGlobals());

test("horizontal fades stop at meaningful content while native trailing space remains scrollable", () => {
  let measure!: ResizeObserverCallback;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        measure = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const content = (end?: number) => (
    <ScrollShadow axis="both" endX={end}>
      <div role="list" />
    </ScrollShadow>
  );
  const view = render(content(700));
  const viewport = screen.getByRole("list"),
    wrapper = viewport.parentElement!;
  const width = vi.fn(() => 400);
  Object.defineProperties(viewport, {
    clientWidth: { get: width },
    scrollWidth: { value: 1000 },
    clientHeight: { value: 100 },
    scrollHeight: { value: 100 },
    offsetWidth: { value: 400 },
    offsetHeight: { value: 100 },
  });
  act(() => measure([], {} as ResizeObserver));
  expect(wrapper).toHaveAttribute("data-overflow-right");
  const reads = width.mock.calls.length;
  fireEvent.scroll(viewport, { target: { scrollLeft: 300 } });
  expect(wrapper).not.toHaveAttribute("data-overflow-right");
  expect(wrapper).toHaveAttribute("data-overflow-left");
  expect(width).toHaveBeenCalledTimes(reads);
  fireEvent.scroll(viewport, { target: { scrollLeft: 500 } });
  expect(wrapper).not.toHaveAttribute("data-overflow-right");
  // A composition shrink can leave only trailing padding without changing viewport size.
  view.rerender(content(350));
  act(() => measure([], {} as ResizeObserver));
  fireEvent.scroll(viewport, { target: { scrollLeft: 0 } });
  expect(wrapper).not.toHaveAttribute("data-overflow-right");
  expect(wrapper.style.getPropertyValue("--scroll-shadow-scrollbar-bottom")).toBe("6px");
  // Removing the optional bound restores native extent; oversized bounds cannot extend it.
  for (const end of [undefined, 1500]) {
    view.rerender(content(end));
    act(() => measure([], {} as ResizeObserver));
    expect(wrapper).toHaveAttribute("data-overflow-right");
    fireEvent.scroll(viewport, { target: { scrollLeft: 600 } });
    expect(wrapper).not.toHaveAttribute("data-overflow-right");
    fireEvent.scroll(viewport, { target: { scrollLeft: 0 } });
  }
});
