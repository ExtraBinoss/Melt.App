import { motionValue } from "motion/react";
import { expect, test, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { MobileNavigation } from "../../../../src/components/shared/navigation/MobileNavigation";
import { setup } from "../../../support/ui";

const items = [
  { value: "projects", label: "Projects", icon: <svg /> },
  { value: "templates", label: "Templates", icon: <svg /> },
  { value: "community", label: "Community", icon: <svg />, badge: "Soon", disabled: true },
  { value: "preferences", label: "Preferences", icon: <svg /> },
];
test("uses ordinary accessible buttons, a disabled community and one local selection", () => {
  const choose = vi.fn();
  setup().mount(
    <MobileNavigation label="Library" value="projects" items={items} onSelect={choose} />,
  );
  const nav = screen.getByRole("navigation", { name: "Library" });
  expect(within(nav).getByRole("button", { name: "Projects" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const community = within(nav).getByRole("button", { name: "Community · Soon" });
  expect(community).toBeDisabled();
  fireEvent.click(community);
  expect(choose).not.toHaveBeenCalled();
  fireEvent.click(within(nav).getByRole("button", { name: "Templates" }));
  expect(choose).toHaveBeenCalledOnce();
  expect(choose.mock.calls[0]![0]).toBe("templates");
  expect(nav.querySelectorAll(".mobile-nav-indicator")).toHaveLength(1);
});
test("arrow, Home and End focus enabled buttons without activating a section", () => {
  const choose = vi.fn();
  setup().mount(
    <MobileNavigation label="Library" value="projects" items={items} onSelect={choose} />,
  );
  const projects = screen.getByRole("button", { name: "Projects" });
  projects.focus();
  fireEvent.keyDown(projects, { key: "ArrowLeft" });
  expect(screen.getByRole("button", { name: "Preferences" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "Home" });
  fireEvent.keyDown(projects, { key: "ArrowRight" });
  const templates = screen.getByRole("button", { name: "Templates" });
  expect(templates).toHaveFocus();
  fireEvent.keyDown(templates, { key: "ArrowRight" });
  expect(screen.getByRole("button", { name: "Preferences" })).toHaveFocus();
  expect(choose).not.toHaveBeenCalled();
});
test("editor instances retain expanded semantics and globally disabled navigation", () => {
  setup().mount(
    <>
      <MobileNavigation
        label="Editor"
        value="projects"
        items={items}
        selection="expanded"
        onSelect={vi.fn()}
      />
      <MobileNavigation
        label="Busy library"
        value="templates"
        items={items}
        disabled
        onSelect={vi.fn()}
      />
    </>,
  );
  const editor = screen.getByRole("navigation", { name: "Editor" });
  expect(within(editor).getByRole("button", { name: "Projects" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(editor.querySelectorAll(".mobile-nav-indicator")).toHaveLength(1);
  const busy = screen.getByRole("navigation", { name: "Busy library" });
  for (const button of within(busy).getAllByRole("button")) expect(button).toBeDisabled();
  expect(busy.querySelectorAll(".mobile-nav-indicator")).toHaveLength(1);
});

test("measures swipe stride after layout and retains the observer across translated labels", () => {
  let measure!: ResizeObserverCallback;
  const observe = vi.fn(),
    disconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        measure = callback;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  const reads = vi.spyOn(HTMLElement.prototype, "offsetLeft", "get");
  const position = motionValue(0);
  const view = setup().mount(
    <MobileNavigation
      label="Library"
      value="projects"
      items={items}
      position={position}
      onSelect={vi.fn()}
    />,
  );
  expect(reads).not.toHaveBeenCalled();
  act(() => measure([], {} as ResizeObserver));
  const measured = reads.mock.calls.length;
  expect(measured).toBe(2);
  view.rerender(
    <MobileNavigation
      label="Library"
      value="projects"
      items={items.map((item) => ({ ...item, label: item.label + " translated" }))}
      position={position}
      onSelect={vi.fn()}
    />,
  );
  expect(reads).toHaveBeenCalledTimes(measured);
  expect(observe).toHaveBeenCalledOnce();
  view.unmount();
  expect(disconnect).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});
