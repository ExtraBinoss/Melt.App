import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ScrollShadow } from "../../../../src/components/shared/scroll/ScrollShadow";

afterEach(() => vi.unstubAllGlobals());
test("resize batches every geometry read before shadow styles and overflow attributes", () => {
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
  render(
    <ScrollShadow>
      <div role="list" />
    </ScrollShadow>,
  );
  const viewport = screen.getByRole("list"),
    wrapper = viewport.parentElement!,
    events: string[] = [];
  for (const [name, value] of Object.entries({
    clientHeight: 100,
    clientWidth: 200,
    scrollHeight: 400,
    scrollWidth: 300,
    offsetHeight: 108,
    offsetWidth: 208,
    scrollTop: 40,
    scrollLeft: 20,
  })) {
    Object.defineProperty(viewport, name, {
      configurable: true,
      get: () => {
        events.push("read");
        return value;
      },
    });
  }
  const set = wrapper.style.setProperty.bind(wrapper.style),
    toggle = wrapper.toggleAttribute.bind(wrapper);
  vi.spyOn(wrapper.style, "setProperty").mockImplementation((...args) => {
    events.push("write");
    set(...args);
  });
  vi.spyOn(wrapper, "toggleAttribute").mockImplementation((...args) => {
    events.push("write");
    return toggle(...args);
  });
  act(() => measure([], {} as ResizeObserver));
  expect(events).toContain("write");
  expect(events.slice(events.indexOf("write"))).not.toContain("read");
  expect(wrapper).toHaveAttribute("data-overflow-top");
  expect(wrapper).toHaveAttribute("data-overflow-bottom");
});
