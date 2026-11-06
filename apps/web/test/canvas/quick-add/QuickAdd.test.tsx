import { TooltipProvider } from "../../../src/components/ui/tooltip";
import type { ReactNode } from "react";
import type { RenderOptions } from "@testing-library/react";
import { createRef } from "react";
import { act, fireEvent, render as renderBase, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { AddArtboardOverlay } from "../../../src/canvas/artboards/AddArtboardOverlay";
import { ViewMotion } from "../../../src/canvas/viewport/motion";
import { QuickAdd } from "../../../src/canvas/quick-add/QuickAdd";
import { createWorkspace } from "../../../src/canvas/artboards/workspace";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { createPlaybackSource } from "../../../src/canvas/session/playback-source";
import { EMPTY_PREVIEW_SOURCE } from "../../../src/state/session/preview-source";
import { createCommandPort } from "../../../src/state/keybindings/command-port";
import { createLibraryActions } from "../../../src/components/assets/library-actions";
import * as search from "../../../src/components/search/catalog/search";
import * as quickCatalog from "../../../src/canvas/quick-add/catalog";
const render = (node: ReactNode, options?: RenderOptions) =>
  renderBase(node, {
    ...options,
    wrapper: ({ children }) => <TooltipProvider>{children}</TooltipProvider>,
  });
vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { dir: () => "ltr" } }),
}));
const mode = vi.hoisted(() => ({ value: "classic" }));
vi.mock("../../../src/ui/studio/workspace-mode", () => ({ useWorkspaceMode: () => mode.value }));
afterEach(() => {
  vi.restoreAllMocks();
  mode.value = "classic";
});

function fixture() {
  const page = createPage({ width: 200, height: 160 }),
    engine = new EditorEngine(createProject({ pages: [page] })),
    controller = new SceneController(engine, EMPTY_PREVIEW_SOURCE),
    workspace = createWorkspace(engine, controller),
    viewport = createRef<HTMLDivElement>();
  viewport.current = document.createElement("div");
  viewport.current.tabIndex = 0;
  document.body.append(viewport.current);
  vi.spyOn(viewport.current, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 1000,
    height: 800,
  } as DOMRect);
  const viewSource = new ViewMotion({
      clock: {
        now: () => performance.now(),
        request: requestAnimationFrame,
        cancel: cancelAnimationFrame,
      },
      constrain: (view) => view,
      reduced: () => true,
    }),
    onError = vi.fn();
  const props = { engine, controller, workspace, viewport, viewSource, onError },
    view = render(
      <>
        <AddArtboardOverlay {...props} />
        <QuickAdd {...props} />
      </>,
      { container: viewport.current },
    );
  const open = () =>
    fireEvent.doubleClick(viewport.current!, { clientX: 80, clientY: 90, button: 0 });
  const close = async () => {
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  };
  return { page, engine, controller, workspace, viewport, props, view, open, close, onError };
}
it("opens on empty artboard/world paint, inserts real text/primitives and commits one undo step", async () => {
  const d = fixture();
  fireEvent.doubleClick(d.viewport.current!, { clientX: 500, clientY: 400, button: 0 });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await d.close();
  fireEvent.doubleClick(d.viewport.current!, { clientX: 80, clientY: 90, button: 2 });
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.doubleClick(screen.getByTestId("canvas-add-artboard"), {
    clientX: 80,
    clientY: 90,
    button: 0,
  });
  expect(screen.queryByRole("dialog")).toBeNull();
  for (const [query, kind] of [
    ["text", "text"],
    ["rectangle", "rectangle"],
    ["ellipse", "ellipse"],
  ]) {
    d.open();
    const input = screen.getByRole("combobox", { name: "quickAdd:title" });
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.change(input, { target: { value: query } });
    fireEvent.click(
      screen.getByRole("option", {
        name: `search:commandLabels.tool${kind[0]!.toUpperCase()}${kind.slice(1)}`,
      }),
    );
    expect(d.engine.getSnapshot().project.pages[0]!.layers[0]).toEqual(
      expect.objectContaining({ kind }),
    );
    expect(d.engine.getSnapshot().canUndo).toBe(true);
    act(() => d.engine.undo());
    expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(0);
    expect(d.engine.getSnapshot().canUndo).toBe(false);
  }
  d.view.unmount();
  d.viewport.current?.remove();
});
it.each(["classic", "studio"])(
  "keeps %s artwork and modified gestures out of quick add",
  (workspace) => {
    mode.value = workspace;
    const d = fixture();
    act(() =>
      d.engine.execute({
        type: "addLayers",
        layers: [
          createLayer("text", {
            x: 80,
            y: 60,
            width: 40,
            height: 40,
            locked: true,
          }),
        ],
      }),
    );
    fireEvent.doubleClick(d.viewport.current!, { clientX: 500, clientY: 400, button: 0 });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.doubleClick(d.viewport.current!, {
      clientX: 80,
      clientY: 90,
      button: 0,
      shiftKey: true,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    d.view.unmount();
    d.viewport.current?.remove();
  },
);
it("routes tools and enabled effects through the shared command owner, with unavailable effects disabled", () => {
  const d = fixture(),
    run = vi.fn(() => true),
    stop = createCommandPort(d.engine).subscribe(run);
  d.open();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "hand" } });
  fireEvent.click(screen.getByRole("option", { name: "search:commandLabels.toolHand" }));
  expect(run).toHaveBeenLastCalledWith("action:toolHand");
  d.open();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "blur" } });
  expect(screen.getByRole("option", { name: "search:effectLabels.blur" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  fireEvent.wheel(d.viewport.current!);
  act(() => {
    const layer = createLayer("rectangle");
    d.engine.execute({ type: "addLayers", layers: [layer] });
    d.engine.select([layer.id]);
  });
  d.open();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "blur" } });
  fireEvent.click(screen.getByRole("option", { name: "search:effectLabels.blur" }));
  expect(run).toHaveBeenLastCalledWith("effect:blur");
  stop();
  d.view.unmount();
  d.viewport.current?.remove();
});
it("uses the shared command port synchronously for file imports, artboard creation and the actual library handoff", async () => {
  const d = fixture(),
    run = vi.fn(() => true),
    stop = createCommandPort(d.engine).subscribe(run),
    library = vi.fn(),
    stopLibrary = createLibraryActions(d.engine).subscribe(library);
  d.open();
  fireEvent.click(screen.getByRole("option", { name: "search:commandLabels.addPage" }));
  expect(run).toHaveBeenLastCalledWith("action:addPage");
  d.open();
  fireEvent.click(screen.getByRole("button", { name: "search:files" }));
  fireEvent.click(screen.getByRole("option", { name: "search:commandLabels.importImages" }));
  expect(run).toHaveBeenLastCalledWith("action:importImages");
  d.open();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "svg" } });
  fireEvent.click(screen.getByRole("option", { name: "search:commandLabels.importSvg" }));
  expect(run).toHaveBeenLastCalledWith("action:importSvg");
  d.open();
  fireEvent.click(screen.getByRole("option", { name: "search:commandLabels.toolShape" }));
  expect(run).toHaveBeenLastCalledWith("action:toolShape");
  expect(library).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  stopLibrary();
  d.open();
  fireEvent.click(screen.getByRole("option", { name: "search:commandLabels.toolShape" }));
  expect(d.onError).toHaveBeenCalledWith("quickAdd:unavailable");
  stop();
  d.open();
  fireEvent.click(screen.getByRole("option", { name: "search:commandLabels.importImages" }));
  expect(d.onError).toHaveBeenCalledWith("quickAdd:unavailable");
  d.view.unmount();
  d.viewport.current?.remove();
});
it("cancels stale/wheel/playback sessions, reports command rejection and cleans every subscription", async () => {
  const d = fixture();
  d.open();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "no-matching-action" } });
  expect(screen.getByText("quickAdd:empty")).toBeInTheDocument();
  await d.close();
  d.open();
  fireEvent.wheel(d.viewport.current!);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  d.open();
  act(() => d.engine.load(structuredClone(d.engine.getSnapshot().project)));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  d.open();
  const execute = vi.spyOn(d.engine, "execute").mockImplementationOnce(() => {
    throw new Error("Command rejected");
  });
  fireEvent.click(screen.getByRole("option", { name: "search:commandLabels.toolText" }));
  expect(d.onError).toHaveBeenCalledWith("Command rejected");
  execute.mockRestore();
  d.open();
  act(() => createPlaybackSource(d.engine).set({ page: d.page, assets: {} }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() =>
    expect(screen.getByTestId("canvas-add-artboard")).toHaveAttribute("data-visible", "false"),
  );
  d.open();
  expect(screen.queryByRole("dialog")).toBeNull();
  act(() => createPlaybackSource(d.engine).set(null));
  fireEvent.click(screen.getByTestId("canvas-add-artboard"));
  expect(d.engine.getSnapshot().project.pages).toHaveLength(1);
  d.open();
  fireEvent.click(screen.getByRole("option", { name: "search:commandLabels.importImages" }));
  expect(d.onError).toHaveBeenCalledWith("quickAdd:unavailable");
  const remove = vi.spyOn(d.viewport.current!, "removeEventListener");
  d.view.unmount();
  expect(remove.mock.calls.map(([name]) => name)).toEqual(
    expect.arrayContaining(["dblclick", "wheel"]),
  );
  d.viewport.current?.remove();
  const orphan = render(<QuickAdd {...d.props} viewport={{ current: null }} />);
  orphan.unmount();
});

it("does no catalog construction or search normalization while closed through document commits", async () => {
  const score = vi.spyOn(search, "searchItems"),
    build = vi.spyOn(quickCatalog, "createQuickAddItems");
  const d = fixture();
  try {
    expect(score).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
    act(() => d.engine.execute({ type: "renameProject", name: "Closed quick add" }));
    d.view.rerender(
      <>
        <AddArtboardOverlay {...d.props} />
        <QuickAdd {...d.props} />
      </>,
    );
    expect(score).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
    d.open();
    expect(score).toHaveBeenCalled();
    expect(build).toHaveBeenCalled();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "rectangle" } });
    fireEvent.click(screen.getByRole("option", { name: "search:commandLabels.toolRectangle" }));
    expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.kind).toBe("rectangle");
    score.mockClear();
    build.mockClear();
    act(() => d.engine.execute({ type: "renameProject", name: "Closed after insertion" }));
    d.view.rerender(
      <>
        <AddArtboardOverlay {...d.props} />
        <QuickAdd {...d.props} />
      </>,
    );
    expect(score).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
  } finally {
    d.view.unmount();
    d.viewport.current?.remove();
  }
});

it("opens on blank artboard paint in Studio and preserves claimed text double clicks", () => {
  mode.value = "studio";
  const d = fixture();
  fireEvent.doubleClick(d.viewport.current!, { clientX: 500, clientY: 400, button: 0 });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.wheel(d.viewport.current!);
  d.viewport.current!.addEventListener("dblclick", (event) => event.preventDefault(), {
    capture: true,
  });
  fireEvent.doubleClick(d.viewport.current!, { clientX: 500, clientY: 400, button: 0 });
  expect(screen.queryByRole("dialog")).toBeNull();
  d.view.unmount();
  d.viewport.current?.remove();
});
