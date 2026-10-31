import { expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { EditorServices } from "../../../../src/state/contracts";
import type { LibraryItem } from "../../../../src/services/projects/library/favorites";
import { useLinkedPreview } from "../../../../src/components/projects/items/use-linked-preview";
import { projectSummary } from "../../../support/projects";
import "../../../../src/components/projects/items/messages";
test("linked previews read one durable summary and defer all opening until the dialog action", async () => {
  const project = projectSummary(),
    inspect = vi.fn(),
    open = vi.fn(),
    error = vi.fn();
  const services = {
    listProjectPage: vi.fn(async () => ({ projects: [project], before: null })),
    openProject: vi.fn(),
  } as unknown as EditorServices;
  const request = { kind: "project" as const, id: project.id };
  renderHook(() => useLinkedPreview(request, services, inspect, open, error));
  await waitFor(() => expect(inspect).toHaveBeenCalledOnce());
  expect(services.listProjectPage).toHaveBeenCalledExactlyOnceWith({ ids: [project.id], limit: 1 });
  expect(services.openProject).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
  const [item, activate] = inspect.mock.calls[0]! as [LibraryItem, () => void];
  expect(item).toMatchObject({ kind: "project", id: project.id, name: project.name });
  activate();
  expect(open).toHaveBeenCalledExactlyOnceWith(item);
  expect(error).not.toHaveBeenCalled();
});
test("missing records report a failure and obsolete summary reads cannot reopen a disposed dialog", async () => {
  const inspect = vi.fn(),
    open = vi.fn(),
    error = vi.fn();
  const request = { kind: "project" as const, id: "missing" };
  const services = {
    listProjectPage: vi.fn(async () => ({ projects: [], before: null })),
  } as unknown as EditorServices;
  const first = renderHook(() => useLinkedPreview(request, services, inspect, open, error));
  await waitFor(() => expect(error).toHaveBeenCalledOnce());
  expect(inspect).not.toHaveBeenCalled();
  first.unmount();
  let resolve!: (value: Awaited<ReturnType<EditorServices["listProjectPage"]>>) => void;
  services.listProjectPage = vi.fn(
    () =>
      new Promise<Awaited<ReturnType<EditorServices["listProjectPage"]>>>((done) => {
        resolve = done;
      }),
  );
  const next = renderHook(() => useLinkedPreview(request, services, inspect, open, error));
  next.unmount();
  resolve({ projects: [{ ...projectSummary(), id: "missing" }], before: null });
  await Promise.resolve();
  expect(inspect).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
  expect(error).toHaveBeenCalledOnce();
});
