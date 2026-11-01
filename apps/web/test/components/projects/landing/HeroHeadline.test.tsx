import { expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HeroHeadline } from "../../../../src/components/projects/landing/HeroHeadline";

test("presents one accessible phrase with two native animated chunks", () => {
  const { container } = render(<HeroHeadline lines={["Créez et", "animez."]} />);
  const heading = screen.getByRole("heading", { level: 1, name: "Créez et animez." });
  expect(heading).toBeVisible();
  expect(heading.textContent).toBe("Créez et animez.");
  expect(heading.firstElementChild).toHaveAttribute("aria-hidden", "true");
  expect(container.querySelectorAll(".hero-chunk")).toHaveLength(2);
  expect(container.querySelector(".hero-chunk")).toHaveTextContent("Créez et");
  expect(heading).toHaveAttribute("dir", "auto");
});

test("pauses the finite reveal while hidden and removes its visibility listener", () => {
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const remove = vi.spyOn(document, "removeEventListener");
  const view = render(<HeroHeadline lines={["Create."]} />);
  const heading = screen.getByRole("heading");
  expect(heading).not.toHaveAttribute("data-paused");
  hidden.mockReturnValue(true);
  fireEvent(document, new Event("visibilitychange"));
  expect(heading).toHaveAttribute("data-paused");
  hidden.mockReturnValue(false);
  fireEvent(document, new Event("visibilitychange"));
  expect(heading).not.toHaveAttribute("data-paused");
  view.unmount();
  expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
});

test("starts paused when mounted in a hidden document", () => {
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  render(<HeroHeadline lines={["Design and", "animate."]} />);
  expect(screen.getByRole("heading")).toHaveAttribute("data-paused");
});

test("preserves whole Arabic runs and natural CJK text without inserted spaces", () => {
  const view = render(<HeroHeadline lines={["صمّم", "وحرّك."]} />);
  const heading = screen.getByRole("heading");
  expect(heading.textContent).toBe("صمّم وحرّك.");
  expect(heading.querySelector(".hero-chunk")).toHaveTextContent("صمّم");
  view.rerender(<HeroHeadline lines={["つくって、", "動かす。"]} />);
  expect(heading).toHaveAccessibleName("つくって、 動かす。");
  expect(heading.textContent).toBe("つくって、動かす。");
  expect(heading.querySelectorAll("wbr")).toHaveLength(1);
  expect(heading.querySelectorAll(".hero-chunk")).toHaveLength(2);
  view.rerender(<HeroHeadline lines={["让设计", "动起来。"]} />);
  expect(heading.textContent).toBe("让设计动起来。");
});

test("bounds animation work to four chunks without dropping longer input", () => {
  render(<HeroHeadline lines={["Design", "and", "animate", "your", "next", "idea."]} />);
  const heading = screen.getByRole("heading", { name: "Design and animate your next idea." });
  expect(heading.textContent).toBe("Design and animate your next idea.");
  expect(heading.querySelectorAll(".hero-chunk")).toHaveLength(4);
  expect(heading.querySelectorAll(".hero-chunk")[3]).toHaveTextContent("your next idea.");
});
