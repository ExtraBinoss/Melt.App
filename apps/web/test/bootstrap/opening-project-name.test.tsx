import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { changeLanguage } from "../../src/state/i18n";
import { StudioPreparation } from "../../src/bootstrap/StudioPreparation";
import {
  readOpeningProjectName,
  useOpeningProjectName,
} from "../../src/bootstrap/use-opening-project-name";

const storage = vi.hoisted(() => ({ listPage: vi.fn(), close: vi.fn() }));
vi.mock("../../src/services/projects/storage", () => ({
  ProjectStore: class {
    listPage = storage.listPage;
    close = storage.close;
  },
}));
beforeEach(() => {
  storage.listPage.mockReset();
  storage.close.mockReset().mockResolvedValue(undefined);
});
const page = (id: string, name: string) => ({ projects: [{ id, name }], before: null });

test("reads exactly one durable metadata record and closes the connection on success or failure", async () => {
  storage.listPage.mockResolvedValueOnce(page("saved", "Summer study"));
  await expect(readOpeningProjectName("saved", new AbortController().signal)).resolves.toBe(
    "Summer study",
  );
  expect(storage.listPage).toHaveBeenCalledExactlyOnceWith({ ids: ["saved"], limit: 1 });
  expect(storage.close).toHaveBeenCalledOnce();
  storage.listPage.mockRejectedValueOnce(Error("Unavailable"));
  await expect(readOpeningProjectName("missing", new AbortController().signal)).rejects.toThrow(
    "Unavailable",
  );
  expect(storage.close).toHaveBeenCalledTimes(2);
});

test("uses generic feedback for absent metadata and releases canceled reads", async () => {
  storage.listPage.mockResolvedValueOnce({ projects: [], before: null });
  await expect(readOpeningProjectName("missing", new AbortController().signal)).resolves.toBe(
    undefined,
  );
  let finish!: (result: ReturnType<typeof page>) => void;
  storage.listPage.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
  const controller = new AbortController();
  const task = readOpeningProjectName("saved", controller.signal);
  await waitFor(() => expect(storage.listPage).toHaveBeenCalledTimes(2));
  controller.abort();
  finish(page("saved", "Canceled"));
  await expect(task).rejects.toMatchObject({ name: "AbortError" });
  expect(storage.close).toHaveBeenCalledTimes(2);
});

test("clears an old route label immediately and ignores metadata that resolves after navigation", async () => {
  const finish = new Map<string, (value: ReturnType<typeof page>) => void>();
  storage.listPage.mockImplementation(
    ({ ids }: { ids: string[] }) => new Promise((resolve) => finish.set(ids[0]!, resolve)),
  );
  const view = renderHook(
    ({ id }) => useOpeningProjectName(id, { id: "prior-runtime", name: "Previous runtime" }),
    { initialProps: { id: "a" } },
  );
  expect(view.result.current).toBeUndefined();
  await waitFor(() => expect(finish.has("a")).toBe(true));
  view.rerender({ id: "b" });
  expect(view.result.current).toBeUndefined();
  await waitFor(() => expect(finish.has("b")).toBe(true));
  await act(async () => finish.get("b")!(page("b", "Current")));
  expect(view.result.current).toBe("Current");
  await act(async () => finish.get("a")!(page("a", "Old")));
  expect(view.result.current).toBe("Current");
  view.rerender({ id: "c" });
  expect(view.result.current).toBeUndefined();
  await waitFor(() => expect(finish.has("c")).toBe(true));
  view.unmount();
  await act(async () => finish.get("c")!(page("c", "Unmounted")));
  expect(storage.close).toHaveBeenCalledTimes(3);
});

test("uses the already loaded matching project without another storage read", () => {
  const view = renderHook(() => useOpeningProjectName("saved", { id: "saved", name: "Known" }));
  expect(view.result.current).toBe("Known");
  expect(storage.listPage).not.toHaveBeenCalled();
});

test("localizes a known project name and preserves the generic fallback", async () => {
  await changeLanguage("fr");
  const view = render(<StudioPreparation projectName="Été <2026>" />);
  expect(screen.getByRole("status")).toHaveTextContent("Ouverture de Été <2026>…");
  await act(async () => changeLanguage("en"));
  expect(screen.getByRole("status")).toHaveTextContent("Opening Été <2026>…");
  view.rerender(<StudioPreparation />);
  expect(screen.getByRole("status")).toHaveTextContent("Opening your studio…");
});
