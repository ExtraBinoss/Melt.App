import type { ReactNode } from "react";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Toolbar } from "../../../src/components/toolbar/Toolbar";
import { ToolbarCommand } from "../../../src/components/toolbar/ToolbarCommand";
import { PinnedCommand } from "../../../src/components/toolbar/dock/PinnedCommand";
import { DockCustomizer } from "../../../src/components/toolbar/dock/DockCustomizer";
import { DOCK_STORAGE_KEY } from "../../../src/components/toolbar/dock/preferences";
import { setup } from "../../support/ui";

type CommandProps = { id: string; run: (id: string) => void };
type MemoBody = { type: (props: CommandProps) => ReactNode };

test("metadata/history publications retain unrelated real command bodies while history and selection gates stay live", async () => {
  localStorage.setItem(
    DOCK_STORAGE_KEY,
    JSON.stringify(["action:save", "action:delete", "action:undo"]),
  );
  const d = setup();
  const pins = vi.spyOn(PinnedCommand as unknown as MemoBody, "type");
  const buttons = vi.spyOn(ToolbarCommand as unknown as MemoBody, "type");
  const customizer = vi.spyOn(DockCustomizer as unknown as MemoBody, "type");
  const view = d.mount(
    <Toolbar
      engine={d.engine}
      services={d.services}
      onTask={d.onTask}
      onImport={vi.fn()}
      onProjects={vi.fn()}
      onExport={vi.fn()}
      onPanelMode={vi.fn()}
    />,
  );
  try {
    const group = screen.getByRole("group", { name: "Raccourcis épinglés" });
    const pin = (id: string) =>
      group.querySelector<HTMLButtonElement>(`[data-dock-command="action:${id}"] button`)!;
    const executions = () => [
      pins.mock.calls.filter(([props]) => props.id === "action:save").length,
      pins.mock.calls.filter(([props]) => props.id === "action:delete").length,
      buttons.mock.calls.filter(([props]) => props.id === "action:importImages").length,
      customizer.mock.calls.length,
    ];
    expect(executions().every((count) => count > 0)).toBe(true);
    const initial = executions();
    expect(pin("undo")).toBeDisabled();
    expect(pin("delete")).toBeDisabled();
    for (const patch of [{ background: "#123456" }, { background: "#abcdef" }]) {
      act(() => d.engine.execute({ type: "updatePage", patch }));
      expect(pin("undo")).toBeEnabled();
      expect(executions()).toEqual(initial);
      act(() => d.engine.undo());
      expect(screen.getByRole("button", { name: "Rétablir" })).toBeEnabled();
      expect(executions()).toEqual(initial);
      act(() => d.engine.redo());
      expect(executions()).toEqual(initial);
    }
    fireEvent.click(screen.getByRole("button", { name: "Personnaliser le dock" }));
    expect(screen.getByRole("searchbox", { name: "Rechercher une commande" })).toBeVisible();
    const opened = executions();
    act(() => d.engine.execute({ type: "updatePage", patch: { name: "Latest title" } }));
    expect(executions()).toEqual(opened);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    act(() => d.engine.select([d.rectangle.id]));
    expect(pin("delete")).toBeEnabled();
    const run = buttons.mock.calls[0]![0].run;
    const taskCount = d.onTask.mock.calls.length;
    // Invoke the retained command in the same publication turn, before React paints its new gate.
    act(() => {
      d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { locked: true } });
      run("action:delete");
    });
    expect(d.onTask).toHaveBeenCalledTimes(taskCount);
    expect(pin("delete")).toBeDisabled();
    expect(
      d.engine.getSnapshot().project.pages[0]!.layers.some((l) => l.id === d.rectangle.id),
    ).toBe(true);
    act(() => d.engine.undo());
    expect(pin("delete")).toBeEnabled();
    await act(async () => fireEvent.click(pin("delete")));
    expect(
      d.engine.getSnapshot().project.pages[0]!.layers.some((l) => l.id === d.rectangle.id),
    ).toBe(false);
    await act(async () => fireEvent.click(within(group).getByRole("button", { name: "Annuler" })));
    expect(
      d.engine.getSnapshot().project.pages[0]!.layers.some((l) => l.id === d.rectangle.id),
    ).toBe(true);
  } finally {
    view.unmount();
    localStorage.removeItem(DOCK_STORAGE_KEY);
  }
});
