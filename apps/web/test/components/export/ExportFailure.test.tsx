import { expect, test, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { setup } from "../../support/ui";
import { ExportFailure, exportErrorDetails } from "../../../src/components/export/ExportFailure";

test("shows a visible error and copies the original stack and cause with export context", async () => {
  const failure = new Error("Replay path is missing", {
    cause: new Error("Missing optional setting"),
  });
  const copy = vi.fn<(text: string) => Promise<void>>(async () => {});
  Object.defineProperty(navigator, "clipboard", { value: { writeText: copy }, configurable: true });
  setup().mount(
    <ExportFailure
      message="L’export n’a pas pu aboutir."
      error={failure}
      context="timelapse export · artwork"
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Replay path is missing");
  fireEvent.click(screen.getByRole("button", { name: "Copier" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Copié" })).toBeVisible());
  expect(copy).toHaveBeenCalledExactlyOnceWith(
    exportErrorDetails(failure, "timelapse export · artwork"),
  );
  expect(copy.mock.calls[0]![0]).toContain("Missing optional setting");
});

test("bounds cyclic diagnostics and avoids copying unrelated object payloads", () => {
  const failure = new Error("x".repeat(20000));
  Object.defineProperty(failure, "cause", { value: failure });
  expect(exportErrorDetails(failure).length).toBeLessThanOrEqual(16384);
  expect(
    exportErrorDetails({ message: "Encoder rejected", assets: "private-image-data" }),
  ).not.toContain("private-image-data");
});
