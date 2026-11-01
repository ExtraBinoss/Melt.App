import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { useLayerHover } from "../../../../src/components/layers/rows/use-layer-hover";
import { LayerTree } from "../../../../src/components/layers/tree/LayerTree";
import { useEngine } from "../../../../src/state/session/editor";
import { setup } from "../../../support/ui";

const executions = vi.hoisted(() => vi.fn());
vi.mock("../../../../src/components/layers/rows/use-layer-hover", async (original) => {
  const actual = await original<{ useLayerHover: typeof useLayerHover }>();
  return {
    ...actual,
    useLayerHover: (...args: Parameters<typeof useLayerHover>) => {
      executions();
      return actual.useLayerHover(...args);
    },
  };
});

test("background undo and redo retain layer row execution while actions bind the current page", () => {
  const d = setup();
  function Live() {
    const snapshot = useEngine(d.engine);
    return (
      <LayerTree
        engine={d.engine}
        project={snapshot.project}
        page={snapshot.project.pages[0]!}
        selection={snapshot.selection}
        attachment={null}
        run={d.run}
      />
    );
  }
  d.mount(<Live />);
  expect(executions).toHaveBeenCalled();
  executions.mockClear();
  act(() => d.engine.execute({ type: "updatePage", patch: { background: "#123456" } }));
  act(() => d.engine.undo());
  act(() => d.engine.redo());
  expect(executions).not.toHaveBeenCalled();
  const row = document.querySelector<HTMLElement>(`[data-layer-id="${d.rectangle.id}"]`)!;
  fireEvent.click(row);
  expect(d.engine.getSnapshot().selection).toEqual([d.rectangle.id]);
  fireEvent.click(screen.getByRole("button", { name: "Masquer le calque · Rectangle bleu" }));
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers.find((x) => x.id === d.rectangle.id)!.visible,
  ).toBe(false);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project.pages[0]!.background).toBe("#123456");
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers.find((x) => x.id === d.rectangle.id)!.visible,
  ).toBe(true);
});
