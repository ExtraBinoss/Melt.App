import { expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HeroHeadline } from "../../../../src/components/projects/landing/HeroHeadline";

test("keeps the full heading accessible with only one animated text run per line", () => {
  const { container } = render(<HeroHeadline lines={["Créez.", "Animez."]} />);
  expect(screen.getByRole("heading", { level: 1, name: "Créez. Animez." })).toBeVisible();
  expect(container.querySelectorAll(".hero-line-mask[aria-hidden]")).toHaveLength(2);
  expect(container.querySelectorAll(".hero-line")).toHaveLength(2);
  expect((container.querySelectorAll(".hero-line")[1] as HTMLElement).style.animationDelay).toBe(
    "0.14s",
  );
});

test("pauses the finite reveal while hidden and removes its visibility listener", () => {
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const remove = vi.spyOn(document, "removeEventListener");
  const view = render(<HeroHeadline lines={["Create."]} />);
  const heading = screen.getByRole("heading");
  hidden.mockReturnValue(true);
  fireEvent(document, new Event("visibilitychange"));
  expect(heading).toHaveAttribute("data-paused");
  hidden.mockReturnValue(false);
  fireEvent(document, new Event("visibilitychange"));
  expect(heading).not.toHaveAttribute("data-paused");
  view.unmount();
  expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
});

test("retains natural Arabic and CJK text shaping and keeps markup bounded for longer translations", () => {
  const view = render(<HeroHeadline lines={["ابتكر.", "Create."]} />);
  const heading = screen.getByRole("heading");
  const nodes = heading.querySelectorAll("*").length;
  expect(heading.querySelector(".hero-line")).toHaveTextContent("ابتكر.");
  view.rerender(
    <HeroHeadline lines={["デザインを、シンプルに。", "静止画も、アニメーションも。"]} />,
  );
  expect(heading).toHaveAccessibleName("デザインを、シンプルに。 静止画も、アニメーションも。");
  expect(heading.querySelectorAll("*")).toHaveLength(nodes);
  expect(heading.textContent).toContain("静止画も、アニメーションも。");
});
