import { expect, test, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { setup } from "../../support/ui";
import { ExportLayout } from "../../../src/components/export/ExportLayout";
import { getExportJobs } from "../../../src/services/export/jobs";
import { exportSizeKey } from "../../../src/services/export/measurements";
import "../../../src/components/export/messages";

test("anchors help to the localized size beside export, refines it and reuses only matching completed output", async () => {
  const d = setup(),
    jobs = getExportJobs(d.engine),
    document = d.engine.getSnapshot().project,
    key = exportSizeKey(document, ["motion", 1]);
  const content = (scale = 1) => (
    <ExportLayout
      engine={d.engine}
      controls={null}
      preview={null}
      onClose={vi.fn()}
      onSubmit={vi.fn()}
      submitLabel="Exporter"
      size={{ key: exportSizeKey(document, ["motion", scale]), targetBytes: 13_000_000 }}
    >
      {null}
    </ExportLayout>
  );
  const view = d.mount(content());
  const size = documentSize();
  expect(size).toHaveTextContent(/Poids cible · ≈ 13\sMo/);
  expect(screen.queryByRole("button", { name: "Export en arrière-plan" })).toBeNull();
  expect(size.nextElementSibling).toContainElement(
    screen.getByRole("button", { name: "Exporter" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Poids cible" }));
  expect(await screen.findByRole("tooltip")).toHaveTextContent("débit variable");
  let finish!: () => void;
  act(() => {
    jobs.start(
      { kind: "motion", projectId: document.id, name: "Motion", sizeKey: key },
      async ({ estimate, progress }) => {
        estimate(9_900_000);
        progress(0.5);
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        return { bytes: 9_950_000 };
      },
    );
  });
  expect(documentSize()).toHaveAttribute("data-size-kind", "projected");
  expect(documentSize()).toHaveTextContent(/≈ 9,9\sMo/);
  await act(async () => {
    finish();
  });
  expect(documentSize()).toHaveAttribute("data-size-kind", "measured");
  expect(documentSize()).toHaveTextContent(/9,95\sMo/);
  expect(documentSize()).not.toHaveTextContent("≈");
  view.rerender(content(2));
  expect(documentSize()).toHaveAttribute("data-size-kind", "target");
  view.unmount();
  d.mount(content());
  expect(documentSize()).toHaveAttribute("data-size-kind", "measured");
  await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
});

test("image and quality-based timelapse do not show an invented size or an isolated help icon", () => {
  const d = setup();
  d.mount(
    <ExportLayout
      engine={d.engine}
      controls={null}
      preview={null}
      onClose={vi.fn()}
      onSubmit={vi.fn()}
      submitLabel="Exporter"
      size={{ key: exportSizeKey(d.project, ["timelapse"]) }}
    >
      {null}
    </ExportLayout>,
  );
  expect(document.querySelector(".export-file-size")).toBeNull();
  expect(document.querySelector(".export-footer-meta")).toBeEmptyDOMElement();
});

function documentSize() {
  return document.querySelector(".export-file-size")!;
}
