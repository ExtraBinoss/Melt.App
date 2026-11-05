import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { createSpatialLayer, createSpatialScene } from "@musart/core";
import { MaterialControl } from "../../../src/components/spatial/MaterialControl";
import { EnvironmentControl } from "../../../src/components/spatial/EnvironmentControl";
import { previewAtom } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";

for (const presentation of ["classic", "studio"] as const) {
  for (const kind of ["material", "environment"] as const) {
    test(`${presentation} ${kind} keeps the hovered draft through gaps, cancels dismissal and commits one undo`, () => {
      const d = setup();
      d.engine.transaction([
        {
          type: "updateLayers",
          ids: [d.rectangle.id],
          patch: { spatial: createSpatialLayer("box") },
        },
        { type: "updatePage", patch: { spatial: createSpatialScene() } },
      ]);
      d.engine.load(d.engine.getSnapshot().project);
      d.engine.select([d.rectangle.id]);
      const original = d.engine.getSnapshot().project;
      const Control = kind === "material" ? MaterialControl : EnvironmentControl;
      const view = d.mount(<Control engine={d.engine} run={d.run} presentation={presentation} />);
      const label =
        kind === "material" ? "Matière" : presentation === "studio" ? "Scène" : "Environnement";
      const trigger = screen.getByRole("button", { name: label, exact: true });
      fireEvent.click(trigger);
      const region = screen.getByRole("region", { name: label, exact: true });
      expect(region.querySelector(".studio-sphere-properties")).not.toBeNull();
      expect(region.querySelector(".studio-catalog-swatch")).not.toBeNull();
      const tiles = region.querySelectorAll<HTMLButtonElement>("[data-catalog-preset]");
      const first = tiles[1]!,
        second = tiles[2]!;
      const expected = second.dataset.catalogPreset;
      fireEvent.pointerEnter(first);
      const firstDraft = d.store.get(previewAtom);
      expect(firstDraft).not.toBeNull();
      fireEvent.pointerLeave(first);
      fireEvent.pointerMove(region.querySelector(".studio-catalog-grid")!);
      expect(d.store.get(previewAtom)).toBe(firstDraft);
      fireEvent.pointerEnter(second);
      const secondDraft = d.store.get(previewAtom);
      expect(secondDraft).not.toBe(firstDraft);
      fireEvent.pointerLeave(second);
      fireEvent.pointerMove(region.querySelector(".studio-sphere-properties")!);
      expect(d.store.get(previewAtom)).toBe(secondDraft);
      expect(d.engine.getSnapshot().project).toBe(original);
      expect(d.engine.getSnapshot().canUndo).toBe(false);
      fireEvent.keyDown(region, { key: "Escape" });
      expect(d.store.get(previewAtom)).toBeNull();
      expect(d.engine.getSnapshot().project).toBe(original);
      expect(d.run).not.toHaveBeenCalled();

      fireEvent.click(trigger);
      const reopened = screen.getByRole("region", { name: label, exact: true });
      const chosen = reopened.querySelector<HTMLButtonElement>(
        `[data-catalog-preset="${expected}"]`,
      )!;
      fireEvent.focus(chosen);
      expect(d.store.get(previewAtom)).not.toBeNull();
      fireEvent.click(chosen, { button: 2 });
      expect(d.engine.getSnapshot().project).toBe(original);
      fireEvent.click(chosen);
      expect(d.store.get(previewAtom)).toBeNull();
      expect(d.run).toHaveBeenCalledOnce();
      const committed = d.engine.getSnapshot().project;
      if (kind === "material")
        expect(committed.pages[0]!.layers[0]!.spatial!.material.preset).toBe(expected);
      else expect(committed.pages[0]!.spatial!.environment.preset).toBe(expected);
      fireEvent.pointerEnter(reopened.querySelector<HTMLButtonElement>("[data-catalog-preset]")!);
      fireEvent.keyDown(reopened, { key: "Escape" });
      expect(d.store.get(previewAtom)).toBeNull();
      expect(d.engine.getSnapshot().project).toBe(committed);
      act(() => d.engine.undo());
      expect(d.engine.getSnapshot().project).toEqual(original);
      expect(d.engine.getSnapshot().canUndo).toBe(false);
      view.unmount();
    });
  }
}
