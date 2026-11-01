import { act } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { revealNavigation } from "../../../../src/components/projects/opening/navigation";
vi.mock("motion/mini", () => ({
  animate: vi.fn(() => ({ stop: vi.fn(), finished: Promise.resolve() })),
}));
vi.mock("../../../../src/components/projects/opening/OpeningSurface", () => ({
  OpeningSurface: () => <span>Opening</span>,
}));
afterEach(() => {
  document.querySelector(".project-dashboard")?.remove();
});
test("covers navigation until its actual destination mounts, then releases the independent surface", async () => {
  const navigate = vi.fn(() => Promise.resolve());
  let done!: Promise<void>;
  await act(async () => {
    done = revealNavigation(navigate, ".project-dashboard");
  });
  expect(navigate).toHaveBeenCalledOnce();
  expect(document.querySelector(".project-opening-surface")).not.toBeNull();
  await act(async () => {
    const target = document.createElement("div");
    target.className = "project-dashboard";
    document.body.append(target);
    await done;
  });
  expect(document.querySelector(".project-opening-surface")).toBeNull();
});
test("failed navigation retires its root, animated circle and listeners", async () => {
  await act(async () => {
    await expect(
      revealNavigation(() => Promise.reject(Error("route failed")), ".project-dashboard"),
    ).rejects.toThrow("route failed");
  });
  expect(document.querySelector(".project-opening-surface")).toBeNull();
});
