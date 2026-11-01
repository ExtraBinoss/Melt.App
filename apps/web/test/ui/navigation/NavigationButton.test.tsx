import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { NavigationButton } from "../../../src/ui/navigation/NavigationButton";

test("retains a native href, primary keyboard/client activation and browser modified clicks", () => {
  const navigate = vi.fn(),
    prepare = vi.fn();
  const view = render(
    <NavigationButton href="/dashboard" onNavigate={navigate} onPrepare={prepare}>
      Try Melt
    </NavigationButton>,
  );
  const link = screen.getByRole("button", { name: "Try Melt" });
  expect(link.tagName).toBe("A");
  expect(link).toHaveAttribute("href", "/dashboard");
  fireEvent.pointerEnter(link);
  expect(prepare).toHaveBeenCalledOnce();
  fireEvent.click(link);
  expect(navigate).toHaveBeenCalledOnce();
  let cancelled = true;
  const capture = (event: MouseEvent) => {
    cancelled = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener("click", capture);
  fireEvent.click(link, { ctrlKey: true });
  expect(cancelled).toBe(false);
  expect(navigate).toHaveBeenCalledOnce();
  document.removeEventListener("click", capture);
  fireEvent.keyDown(link, { key: " " });
  expect(navigate).toHaveBeenCalledTimes(2);
  view.rerender(
    <NavigationButton href="/dashboard" onNavigate={navigate} disabled>
      Try Melt
    </NavigationButton>,
  );
  expect(screen.getByRole("button")).toBeDisabled();
  expect(screen.getByRole("button")).not.toHaveAttribute("href");
});
