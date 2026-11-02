import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { createLayer, createPage, createProject } from "@musart/core";
import { LayersPresentation } from "../../../src/components/workspace/LayersPresentation";
import { useSidebarSnapshot } from "../../../src/components/workspace/use-sidebar-snapshot";
import { getCanonicalPresentation } from "../../../src/state/session/canonical-presentation";
import { setup } from "../../support/ui";

function fixture() {
  const data = setup();
  data.engine.execute({
    type: "updateLayers",
    ids: [data.rectangle.id],
    patch: { name: "Changed", visible: false },
  });
  const presentation = getCanonicalPresentation(data.engine);
  const publisher = presentation.acquire();
  function origin() {
    const snapshot = data.engine.getSnapshot();
    return { projectId: snapshot.project.id, revision: snapshot.revision };
  }
  publisher.present(publisher.request(origin(), true));
  function Live() {
    const { snapshot, historyNavigation } = useSidebarSnapshot(data.engine);
    return (
      <LayersPresentation
        engine={data.engine}
        services={data.services}
        run={data.run}
        model={{
          page: snapshot.project.pages.find((page) => page.id === snapshot.pageId)!,
          project: snapshot.project,
          selection: snapshot.selection,
          historyNavigation,
          origin: { projectId: snapshot.project.id, revision: snapshot.revision },
        }}
      />
    );
  }
  const mounted = data.mount(<Live />);
  const boundary = mounted.container.querySelector("[data-layers-presentation]")!;
  return { ...data, ...mounted, boundary, publisher, origin };
}

test("history retains the row tree until after the latest draw is presented, guards stale actions and then accepts fresh actions", async () => {
  const previousURL = location.href;
  history.replaceState({}, "", "/?automation=1");
  const d = fixture();
  try {
    const panel = d.container.querySelector<HTMLElement>(".layers-panel")!;
    const renders = panel.dataset.reactRenders;
    act(() => d.engine.undo());
    const undo = d.publisher.request(d.origin(), true);
    expect(d.boundary).toHaveAttribute("aria-busy", "true");
    expect(panel.dataset.reactRenders).toBe(renders);
    const revision = d.engine.getSnapshot().revision;
    fireEvent.click(screen.getByLabelText("Afficher le calque · Changed"));
    fireEvent.keyDown(screen.getByText("Changed"), { key: "Delete" });
    fireEvent.drop(screen.getByRole("tree", { name: "Calques" }));
    expect(d.engine.getSnapshot().revision).toBe(revision);
    const historyShortcut = vi.fn();
    window.addEventListener("keydown", historyShortcut);
    try {
      fireEvent.keyDown(screen.getByText("Changed"), { key: "z", ctrlKey: true });
      expect(historyShortcut).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener("keydown", historyShortcut);
    }

    act(() => d.engine.redo());
    const redo = d.publisher.request(d.origin(), true);
    act(() => d.publisher.present(undo));
    expect(d.boundary).toHaveAttribute("aria-busy", "true");
    expect(panel.dataset.reactRenders).toBe(renders);
    act(() => d.engine.undo());
    const latest = d.publisher.request(d.origin(), true);
    act(() => d.publisher.present(redo));
    expect(d.boundary).toHaveAttribute("aria-busy", "true");
    expect(panel.dataset.reactRenders).toBe(renders);
    act(() => d.publisher.present(latest));
    expect(d.boundary).toHaveAttribute("aria-busy", "true");
    expect(panel.dataset.reactRenders).toBe(renders);
    await waitFor(() => expect(d.boundary).toHaveAttribute("aria-busy", "false"));
    expect(screen.queryByText("Changed")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Masquer le calque · Rectangle bleu"));
    expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.visible).toBe(false);
    expect(screen.getByLabelText("Afficher le calque · Rectangle bleu")).toBeVisible();
    expect(d.boundary).toHaveAttribute("aria-busy", "false");
    fireEvent.click(screen.getByText("Titre"));
    expect(d.engine.getSnapshot().selection).toEqual([d.text.id]);
    expect(d.container.querySelector(`[data-layer-id="${d.text.id}"]`)).toHaveAttribute(
      "aria-selected",
      "true",
    );
  } finally {
    d.unmount();
    d.publisher.release();
    history.replaceState({}, "", previousURL);
  }
});

test("selection, page and project replacement supersede pending history without adopting a stale draw", () => {
  const d = fixture();
  try {
    act(() => d.engine.undo());
    const old = d.publisher.request(d.origin(), true);
    act(() => d.engine.select([d.text.id]));
    expect(d.boundary).toHaveAttribute("aria-busy", "false");
    expect(d.container.querySelector(`[data-layer-id="${d.text.id}"]`)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    act(() => d.engine.redo());
    expect(d.boundary).toHaveAttribute("aria-busy", "true");
    const page = createPage({ name: "Replacement page" });
    act(() => d.engine.execute({ type: "addPage", page }));
    expect(d.boundary).toHaveAttribute("aria-busy", "false");
    expect(screen.getByText("Replacement page")).toBeVisible();
    act(() => d.publisher.present(old));
    expect(screen.getByText("Replacement page")).toBeVisible();
    act(() => d.engine.undo());
    expect(d.boundary).toHaveAttribute("aria-busy", "true");
    const replacement = createProject({
      pages: [createPage({ layers: [createLayer("rectangle", { name: "Fresh project" })] })],
    });
    act(() => d.engine.load(replacement));
    expect(d.boundary).toHaveAttribute("aria-busy", "false");
    expect(screen.getByText("Fresh project")).toBeVisible();
    expect(screen.queryByText("Changed")).not.toBeInTheDocument();
    act(() => d.publisher.present(old));
    expect(screen.getByText("Fresh project")).toBeVisible();
  } finally {
    d.unmount();
    d.publisher.release();
  }
});
