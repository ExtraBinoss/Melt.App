import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TransitionLink } from "../../src/ui/navigation/TransitionLink";

const navigation = vi.hoisted(() => ({
  navigate: vi.fn().mockResolvedValue(undefined),
  reveal: vi.fn(async (navigate: () => Promise<unknown>) => navigate()),
}));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: navigation.navigate }),
}));
vi.mock("../../src/components/projects/opening/navigation", () => ({
  revealNavigation: navigation.reveal,
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});
afterEach(cleanup);

test("starts a route reveal at the pointer and resets the public scroller under its cover", async () => {
  const scrollTo = vi.fn();
  render(
    <div
      className="public-page"
      ref={(node) => {
        if (node) node.scrollTo = scrollTo;
      }}
    >
      <TransitionLink href="/tools" revealTarget={'[data-tool-route="hub"]'}>
        Free tools
      </TransitionLink>
    </div>,
  );
  const link = screen.getByRole("link", { name: "Free tools" });
  expect(link).toHaveAttribute("href", "/tools");
  fireEvent.click(link, { detail: 1, clientX: 180, clientY: 92 });
  await waitFor(() => expect(navigation.reveal).toHaveBeenCalledOnce());
  expect(navigation.reveal).toHaveBeenCalledWith(expect.any(Function), '[data-tool-route="hub"]', {
    x: 180,
    y: 92,
  });
  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith({ href: "/tools" }));
  expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
});

test("keyboard activation centers the reveal on the focused link", async () => {
  render(
    <TransitionLink href="/tools/ascii-converter" revealTarget={'[data-tool-route="ascii"]'}>
      ASCII
    </TransitionLink>,
  );
  const link = screen.getByRole("link", { name: "ASCII" });
  vi.spyOn(link, "getBoundingClientRect").mockReturnValue({
    left: 40,
    top: 60,
    width: 120,
    height: 40,
  } as DOMRect);
  link.focus();
  fireEvent.click(link, { detail: 0 });
  await waitFor(() => expect(navigation.reveal).toHaveBeenCalledOnce());
  expect(navigation.reveal).toHaveBeenCalledWith(
    expect.any(Function),
    '[data-tool-route="ascii"]',
    {
      x: 100,
      y: 80,
    },
  );
});

test("modified, non-primary, same-page and external activations retain browser navigation", () => {
  const view = render(
    <TransitionLink href="/tools" revealTarget={'[data-tool-route="hub"]'}>
      Navigate
    </TransitionLink>,
  );
  const link = screen.getByRole("link", { name: "Navigate" });
  const defaults: boolean[] = [];
  const capture = (event: MouseEvent) => {
    defaults.push(event.defaultPrevented);
    event.preventDefault();
  };
  document.addEventListener("click", capture);
  try {
    for (const activation of [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
      { button: 2 },
    ])
      fireEvent.click(link, activation);
    for (const href of ["/#features", "https://example.com/tools"]) {
      view.rerender(
        <TransitionLink href={href} revealTarget=".landing-page">
          Navigate
        </TransitionLink>,
      );
      fireEvent.click(link);
    }
    expect(defaults).toEqual(Array(8).fill(false));
    expect(navigation.reveal).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  } finally {
    document.removeEventListener("click", capture);
  }
});
