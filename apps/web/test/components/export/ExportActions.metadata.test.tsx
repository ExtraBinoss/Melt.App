import { useState } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { ExportTriggerLabel } from "../../../src/components/export/ExportTriggerLabel";
import { ExportActions } from "../../../src/components/export/ExportActions";
import { useEngine } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";

const executions = vi.hoisted(() => vi.fn());
vi.mock("../../../src/components/export/ExportTriggerLabel", async (original) => {
  const actual = await original<{ ExportTriggerLabel: typeof ExportTriggerLabel }>();
  return {
    ...actual,
    ExportTriggerLabel: (props: Parameters<typeof ExportTriggerLabel>[0]) => {
      executions();
      return <actual.ExportTriggerLabel {...props} />;
    },
  };
});

test("closed exporter retains its controls across metadata edits and reads the current document on opening", async () => {
  const d = setup();
  function Live() {
    const snapshot = useEngine(d.engine);
    const [open, setOpen] = useState(false);
    const [timelapseOpen, setTimelapseOpen] = useState(false);
    return (
      <ExportActions
        engine={d.engine}
        services={d.services}
        onTask={d.onTask}
        page={snapshot.project.pages[0]!}
        pageCount={snapshot.project.pages.length}
        selection={snapshot.selection}
        revision={snapshot.revision}
        open={open}
        onOpenChange={setOpen}
        timelapseOpen={timelapseOpen}
        onTimelapseOpenChange={setTimelapseOpen}
      />
    );
  }
  d.mount(<Live />);
  expect(executions).toHaveBeenCalled();
  executions.mockClear();
  act(() =>
    d.engine.execute({
      type: "updatePage",
      patch: { background: "#123456", name: "Latest artboard" },
    }),
  );
  act(() => d.engine.undo());
  act(() => d.engine.redo());
  expect(executions).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Exporter" }));
  expect(await screen.findByRole("combobox", { name: "Plan de travail" })).toHaveTextContent(
    "Latest artboard",
  );
  fireEvent.click(await screen.findByRole("button", { name: "Annuler" }));
  expect(d.engine.getSnapshot().project.pages[0]!.name).toBe("Latest artboard");
});
