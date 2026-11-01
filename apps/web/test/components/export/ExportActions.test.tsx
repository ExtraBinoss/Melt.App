import { useState } from "react";
import { beforeAll, expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { ExportActions } from "../../../src/components/export/ExportActions";
import { setup } from "../../support/ui";
import { createMotionTransport } from "../../../src/services/motion/transport";
vi.mock("../../../src/components/export/MotionExportPreview", () => ({
  MotionExportPreview: () => <div />,
}));
// This behavior suite tests the dialog; native browser cases cover cold chunk loading.
beforeAll(async () => {
  await import("../../../src/components/export/ExportWorkspace");
});

test("uses one full Export button and selects Timelapse inside the shared output group", async () => {
  const d = setup();
  function Harness() {
    const [open, setOpen] = useState(false);
    const [timelapseOpen, setTimelapseOpen] = useState(false);
    return (
      <ExportActions
        page={d.page}
        pageCount={1}
        engine={d.engine}
        services={d.services}
        onTask={d.onTask}
        open={open}
        onOpenChange={setOpen}
        timelapseOpen={timelapseOpen}
        onTimelapseOpenChange={setTimelapseOpen}
      />
    );
  }
  d.mount(<Harness />);
  expect(screen.queryByRole("button", { name: "Options d’export" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Exporter" }));
  expect(screen.getByRole("dialog", { name: "Exporter la composition" })).toBeVisible();
  fireEvent.click(await screen.findByRole("radio", { name: "Timelapse" }));
  expect(screen.getByRole("dialog", { name: "Exporter la composition" })).toBeVisible();
  expect(screen.getByRole("radio", { name: "Timelapse" })).toBeChecked();
  expect(d.services.exportImage).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button", { name: "Annuler" }));
  expect(screen.queryByRole("dialog", { name: "Exporter la composition" })).toBeNull();
});

test("opening the common exporter pauses only the editor's presentation and never resumes or seeks on close", async () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const transport = createMotionTransport(d.engine);
  transport.seek({ value: 1, rate: 2 });
  transport.play();
  const before = d.engine.getSnapshot(),
    position = transport.read().time;
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <ExportActions
        engine={d.engine}
        page={before.project.pages[0]!}
        pageCount={1}
        services={d.services}
        onTask={d.onTask}
        open={open}
        onOpenChange={setOpen}
        timelapseOpen={false}
        onTimelapseOpenChange={vi.fn()}
      />
    );
  }
  d.mount(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Exporter" }));
  expect(transport.read()).toMatchObject({ playing: false, time: position });
  fireEvent.click(await screen.findByRole("button", { name: "Annuler" }));
  expect(transport.read()).toMatchObject({ playing: false, time: position });
  expect(d.engine.getSnapshot()).toBe(before);
});
