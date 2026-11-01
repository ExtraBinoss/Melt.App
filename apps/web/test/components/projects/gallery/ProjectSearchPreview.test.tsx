import { act, fireEvent, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { ProjectThumbnailLease } from "../../../../src/state/contracts";
import { ProjectSearchPreview } from "../../../../src/components/projects/gallery/ProjectSearchPreview";
import { LibraryToolbar } from "../../../../src/components/projects/dashboard/LibraryToolbar";
import { projectSummary } from "../../../support/projects";
import { setup } from "../../../support/ui";

function lease(projectId: string, url: string): ProjectThumbnailLease {
  return {
    items: [{ pageId: `${projectId}-one`, revision: url, url, width: 320, height: 220 }],
    release: vi.fn(),
  };
}

test("search borrows stored thumbnails for duplicate names and releases them on section changes", async () => {
  const d = setup(),
    leases = [lease("a", "blob:a"), lease("b", "blob:b")];
  d.services.loadProjectPreview = vi.fn();
  vi.mocked(d.services.loadProjectThumbnails).mockImplementation(
    async (id) => leases[id === "a" ? 0 : 1]!,
  );
  const props = {
    services: d.services,
    projects: [projectSummary("a", "Same"), projectSummary("b", "Same")],
    onQueryChange: vi.fn(),
    onModeChange: vi.fn(),
    disabled: false,
    mode: "all" as const,
    query: "",
  };
  const view = d.mount(<LibraryToolbar {...props} view="projects" />);
  await waitFor(() =>
    expect(document.querySelector('[data-project-search-preview="a"]')).toHaveAttribute(
      "src",
      "blob:a",
    ),
  );
  expect(document.querySelector('[data-project-search-preview="b"]')).toHaveAttribute(
    "src",
    "blob:b",
  );
  expect(d.services.loadProjectThumbnails).toHaveBeenCalledWith("a", ["a-one"], {
    allowStale: true,
  });
  expect(d.services.loadProjectPreview).not.toHaveBeenCalled();
  expect(d.services.openProject).not.toHaveBeenCalled();
  view.rerender(<LibraryToolbar {...props} view="templates" />);
  expect(leases[0]!.release).toHaveBeenCalledOnce();
  expect(leases[1]!.release).toHaveBeenCalledOnce();
});

test("obsolete thumbnail reads cannot replace a new project and are released, including after unmount", async () => {
  const d = setup(),
    a = lease("a", "blob:a"),
    b = lease("b", "blob:b");
  let resolveA!: (value: ProjectThumbnailLease) => void,
    resolveB!: (value: ProjectThumbnailLease) => void;
  vi.mocked(d.services.loadProjectThumbnails)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveA = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveB = resolve;
        }),
    );
  const view = d.mount(
    <ProjectSearchPreview project={projectSummary("a")} services={d.services} />,
  );
  view.rerender(<ProjectSearchPreview project={projectSummary("b")} services={d.services} />);
  await act(async () => resolveA(a));
  expect(a.release).toHaveBeenCalledOnce();
  expect(document.querySelector('[data-project-search-preview="b"]')).not.toHaveAttribute(
    "src",
    "blob:a",
  );
  view.unmount();
  await act(async () => resolveB(b));
  expect(b.release).toHaveBeenCalledOnce();
});

test("thumbnail updates replace one lease and broken images retain a static branded fallback", async () => {
  const d = setup(),
    a = lease("a", "blob:a"),
    fresh = lease("a", "blob:fresh");
  let updated!: (id: string) => void;
  vi.mocked(d.services.subscribeProjectThumbnails).mockImplementation((listener) => {
    updated = listener;
    return vi.fn();
  });
  vi.mocked(d.services.loadProjectThumbnails).mockResolvedValueOnce(a).mockResolvedValueOnce(fresh);
  const view = d.mount(
    <ProjectSearchPreview project={projectSummary("a")} services={d.services} />,
  );
  await waitFor(() => expect(document.querySelector("img")).toHaveAttribute("src", "blob:a"));
  await act(async () => updated("other"));
  expect(d.services.loadProjectThumbnails).toHaveBeenCalledOnce();
  await act(async () => updated("a"));
  expect(document.querySelector("img")).toHaveAttribute("src", "blob:fresh");
  expect(a.release).toHaveBeenCalledOnce();
  fireEvent.error(document.querySelector("img")!);
  expect(document.querySelector("img")!.getAttribute("src")).toMatch(/branding\/melt\.svg$/);
  view.unmount();
  expect(fresh.release).toHaveBeenCalledOnce();
});
