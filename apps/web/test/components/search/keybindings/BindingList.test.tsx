import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ShortcutSettings } from "../../../../src/components/search/keybindings/ShortcutSettings";
import { BINDING_COMMANDS } from "../../../../src/state/keybindings/registry";
import { setup } from "../../../support/ui";

test("shortcut window bounds mounted rows, follows keyboard focus and resets filtered results", () => {
  const d = setup();
  d.mount(<ShortcutSettings />);
  const list = screen.getByRole("list");
  expect(screen.getAllByRole("listitem").length).toBeLessThan(20);
  expect(screen.getAllByRole("listitem")[0]).toHaveAttribute(
    "aria-setsize",
    String(BINDING_COMMANDS.length),
  );
  const last = screen.getAllByRole("listitem").at(-1)!;
  const index = Number(last.getAttribute("aria-posinset"));
  const button = [...last.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")].at(-1)!;
  button.focus();
  fireEvent.keyDown(button, { key: "Tab" });
  const focused = document.activeElement!.closest('[role="listitem"]')!;
  expect(focused).toHaveAttribute("aria-posinset", String(index + 1));
  fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
  expect(document.activeElement!.closest('[role="listitem"]')).toBe(last);
  Object.defineProperty(list, "clientHeight", { configurable: true, value: 150 });
  fireEvent.scroll(list, { target: { scrollTop: 4000 } });
  expect(last).toBeInTheDocument(); // Scrolling never unmounts the active recorder/focus owner.
  expect(screen.getAllByRole("listitem").length).toBeLessThan(22);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Enregistrer" } });
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  expect(screen.getAllByRole("listitem")[0]).toHaveAttribute("aria-posinset", "1");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no-command-zz" } });
  expect(screen.queryAllByRole("listitem")).toHaveLength(0);
});

test("recording feedback changes measured row heights and cancellation restores offsets", () => {
  const callbacks: ResizeObserverCallback[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  const d = setup();
  try {
    const view = d.mount(<ShortcutSettings />);
    const rows = [...document.querySelectorAll<HTMLElement>("[data-binding-index]")];
    for (const row of rows)
      Object.defineProperty(row, "offsetHeight", {
        configurable: true,
        get: () => (row.querySelector(".binding-feedback") ? 108 : 54),
      });
    const measure = () => callbacks.forEach((callback) => callback([], {} as ResizeObserver));
    act(measure);
    expect(rows[1]!.style.top).toBe("54px");
    const capture = rows[0]!.querySelector<HTMLButtonElement>(".binding-capture")!;
    fireEvent.click(capture);
    act(measure);
    expect(rows[1]!.style.top).toBe("108px");
    fireEvent.keyDown(capture, { key: "Escape" });
    act(measure);
    expect(rows[1]!.style.top).toBe("54px");
    view.unmount();
  } finally {
    vi.unstubAllGlobals();
  }
});
