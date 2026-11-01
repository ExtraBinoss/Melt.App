import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { createSpatialScene } from "@musart/core";
import { Inspector } from "../../../../src/components/properties/Inspector";
import { previewAtom, useEngine } from "../../../../src/state/session/editor";
import { setup } from "../../../support/ui";

const previousURL = location.href;
afterEach(() => history.replaceState({}, "", previousURL));

function mount() {
  const d = setup();
  d.engine.execute({ type: "updatePage", patch: { spatial: createSpatialScene() } });
  d.engine.load(d.engine.getSnapshot().project);
  function Live() {
    const snapshot = useEngine(d.engine),
      page = snapshot.project.pages[0]!;
    return (
      <Inspector
        engine={d.engine}
        page={page}
        assets={snapshot.project.assets}
        selected={[]}
        run={d.run}
      />
    );
  }
  history.replaceState({}, "", "/?automation=1");
  const mounted = d.mount(<Live />);
  return { ...d, ...mounted };
}

test("background mode publishes only paint controls and retains live dimensions, guides and scene actions", async () => {
  const d = mount(),
    region = screen.getByRole("region", { name: "Propriétés" }),
    commits = region.getAttribute("data-react-renders"),
    width = screen.getByRole("textbox", { name: "Largeur" }),
    intensity = screen.getByRole("textbox", { name: "Intensité" });
  expect(commits).toBe("1");
  const initial = d.engine.getSnapshot().project.pages[0]!;
  await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Dégradé" })));
  expect(region).toHaveAttribute("data-react-renders", commits);
  expect(screen.getByRole("textbox", { name: "Largeur" })).toBe(width);
  expect(screen.getByRole("textbox", { name: "Intensité" })).toBe(intensity);
  expect(d.engine.getSnapshot().project.pages[0]!.backgroundGradient).toBeDefined();
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project.pages[0]!.backgroundGradient).toBeUndefined();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  act(() => d.engine.redo());
  expect(screen.getByRole("radio", { name: "Dégradé" })).toHaveAttribute("aria-checked", "true");
  fireEvent.change(intensity, { target: { value: "2.5" } });
  fireEvent.blur(intensity);
  expect(d.engine.getSnapshot().project.pages[0]!.spatial!.environment.intensity).toBe(2.5);
  fireEvent.change(width, { target: { value: "1200" } });
  fireEvent.blur(width);
  expect(d.engine.getSnapshot().project.pages[0]!.width).toBe(1200);
  fireEvent.click(screen.getByRole("button", { name: "Ajouter vertical" }));
  expect(d.engine.getSnapshot().project.pages[0]!.guides).toHaveLength(initial.guides.length + 1);
});

test("queued background writes reject a newer paint and active solid drafts cancel on canonical edits", async () => {
  const d = mount();
  let queued!: () => void;
  d.run.mockImplementation((task) => {
    queued = task;
  });
  await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Dégradé" })));
  act(() => d.engine.execute({ type: "updatePage", patch: { background: "#123456" } }));
  act(() => queued());
  expect(d.engine.getSnapshot().project.pages[0]!.backgroundGradient).toBeUndefined();
  const color = screen.getByLabelText("Couleur hexadécimale");
  fireEvent.change(color, { target: { value: "#abcdef" } });
  expect(d.store.get(previewAtom)).not.toBeNull();
  act(() => d.engine.execute({ type: "updatePage", patch: { background: "#654321" } }));
  expect(d.store.get(previewAtom)).toBeNull();
  d.run.mockClear();
  fireEvent.blur(color);
  expect(d.run).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot().project.pages[0]!.background).toBe("#654321");
});
