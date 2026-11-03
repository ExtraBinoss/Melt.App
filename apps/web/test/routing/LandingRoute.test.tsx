import { expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
const navigate = vi.hoisted(() => vi.fn(async () => {}));
const prepare = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../src/bootstrap/preload", () => ({ preloadStudio: prepare }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("../../src/components/projects/landing/LandingPage", () => ({
  LandingPage: ({
    onCreate,
    onTemplate,
    onPrepare,
    navigation,
  }: {
    onCreate: () => void;
    onTemplate: (id: string) => void;
    onPrepare: () => void;
    navigation: React.ReactNode;
  }) => (
    <>
      <button onClick={onCreate} onPointerEnter={onPrepare}>
        Create
      </button>
      <button onClick={() => onTemplate("in-bloom")}>Template</button>
      {navigation}
      <div className="project-dashboard" />
      <div className="library-item-dialog" />
    </>
  ),
}));
import { LandingRoute } from "../../src/routing/LandingRoute";
test("Try Melt is the sole library entry and choosing a template opens its library preview", async () => {
  vi.mocked(window.matchMedia).mockImplementation((query) => ({
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
    matches: query.includes("prefers-reduced-motion"),
  }));
  render(<LandingRoute />);
  expect(prepare).not.toHaveBeenCalled();
  expect(screen.queryAllByRole("link")).toHaveLength(0);
  fireEvent.pointerEnter(screen.getByText("Create"));
  expect(prepare).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByText("Create"));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/dashboard", search: {} }));
  fireEvent.click(screen.getByText("Template"));
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith({
      to: "/dashboard",
      search: { preview: "template", item: "in-bloom" },
    }),
  );
  await waitFor(() => expect(document.querySelector(".project-opening-surface")).toBeNull());
});
