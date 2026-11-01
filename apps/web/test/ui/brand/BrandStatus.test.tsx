import { act, render } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { BrandStatus } from "../../../src/ui/brand/BrandStatus";
import { createBrandActivity } from "../../../src/ui/brand/activity";
test("operation marks stay decorative beside their owner's existing live status text", async () => {
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  vi.useFakeTimers();
  const view = render(<BrandStatus size={36} state="preparing" />);
  expect(view.container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  expect(view.container.querySelector("img")).toHaveAttribute(
    "src",
    expect.stringContaining("melt-idle.webp"),
  );
  await act(async () => {
    await import("../../../src/ui/brand/MeltLogo");
  });
  expect(view.container.querySelector("svg")).toHaveAttribute("data-brand-state", "working");
  vi.useRealTimers();
  expect(view.container.querySelector("svg")).toHaveAttribute("width", "36");
  expect(view.container.querySelector('[role="status"]')).toBeNull();
});

test("inactive operations allocate no hidden SVG engine nodes and completion releases the active leaf", async () => {
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  vi.useFakeTimers();
  const activity = createBrandActivity(false),
    view = render(<BrandStatus activity={activity} />);
  expect(view.container.querySelector("svg")).toBeNull();
  act(() => activity.set(true));
  act(() => {
    vi.advanceTimersByTime(160);
  });
  await act(async () => {
    await import("../../../src/ui/brand/MeltLogo");
  });
  expect(view.container.querySelector("svg")).not.toBeNull();
  act(() => activity.set(false));
  act(() => {
    vi.advanceTimersByTime(160);
  });
  vi.useRealTimers();
  expect(view.container.querySelector("svg")).toBeNull();
});
