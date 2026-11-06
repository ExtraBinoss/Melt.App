import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { createLayer, createPage, createProject } from "@musart/core";
import { EditorFeedbackStack } from "../../../src/components/notifications/EditorFeedbackStack";
import { publishEditorNotice } from "../../../src/components/notifications/source";
import { setup } from "../../support/ui";

afterEach(() => vi.useRealTimers());
const advance = async (milliseconds: number) => {
  await act(async () => {
    vi.advanceTimersByTime(milliseconds);
  });
};

test("bounds the shared queue to five, pauses every card, isolates parents, and clears on load/unmount", async () => {
  vi.useFakeTimers();
  const d = setup();
  let parents = 0;
  function Parent() {
    parents++;
    return <EditorFeedbackStack engine={d.engine} />;
  }
  const view = d.mount(<Parent />);
  act(() => {
    for (let index = 0; index < 7; index++)
      publishEditorNotice(d.engine, { message: `Notice ${index}`, error: false });
  });
  await advance(50);
  expect(screen.getAllByRole("status")).toHaveLength(5);
  expect(screen.queryByText("Notice 0")).toBeNull();
  expect(screen.queryByText("Notice 1")).toBeNull();
  expect(screen.getByText("Notice 6")).toBeVisible();
  const anchor = document.querySelector(".editor-feedback-stack")!;
  fireEvent.pointerOver(anchor);
  await advance(8000);
  expect(screen.getAllByRole("status")).toHaveLength(5);
  fireEvent.pointerOut(anchor);
  await advance(5000);
  // Sonner delivers dismissal through two RAFs, then completes its exit timeout.
  await advance(32);
  await advance(32);
  await advance(1000);
  expect(screen.queryAllByRole("status")).toHaveLength(0);
  expect(parents).toBe(1);
  act(() => publishEditorNotice(d.engine, { message: "Before load", error: false }));
  await advance(50);
  act(() => d.engine.load(createProject()));
  await advance(32);
  await advance(32);
  await advance(1000);
  expect(screen.queryAllByRole("status")).toHaveLength(0);
  view.unmount();
  act(() => publishEditorNotice(d.engine, { message: "Detached", error: true }));
  await advance(1000);
  expect(screen.queryByText("Detached")).toBeNull();
});

test("history and editor cards coexist; repeated renderer failures do not fill the queue", async () => {
  vi.useFakeTimers();
  const d = setup();
  d.engine.load(
    createProject({ pages: [createPage({ layers: [createLayer("rectangle", { id: "item" })] })] }),
  );
  const view = d.mount(<EditorFeedbackStack engine={d.engine} />);
  act(() => {
    d.engine.execute({ type: "updateLayers", ids: ["item"], patch: { fill: "#ff0000" } });
    d.engine.undo();
    publishEditorNotice(d.engine, { title: "Validé", message: "Vue recentrée", error: false });
    for (let index = 0; index < 3; index++)
      publishEditorNotice(d.engine, {
        message: "Decode failed",
        details: "packet 42",
        error: true,
      });
  });
  await advance(50);
  expect(screen.getAllByRole("status")).toHaveLength(2);
  expect(document.querySelector(".history-notice")).toBeVisible();
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  const button = screen.getAllByRole("button", { name: "Fermer la notification" })[0]!;
  act(() => button.focus());
  await advance(9000);
  expect(screen.getAllByRole("status")).toHaveLength(2);
  act(() => button.blur());
  const error = screen.getByRole("alert");
  fireEvent.click(within(error).getByRole("button", { name: "Fermer la notification" }));
  expect(error).toHaveAttribute("inert");
  expect(error).toHaveAttribute("aria-hidden", "true");
  expect(screen.queryByRole("alert")).toBeNull();
  view.unmount();
  await advance(1000);
  expect(screen.queryAllByRole("status")).toHaveLength(0);
});
