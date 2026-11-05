import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createLayer, createPage, createProject } from "@musart/core";
import { HistoryNotice } from "../../../../src/components/notifications/history/HistoryNotice";
import { setup } from "../../../support/ui";
vi.mock("motion/react", async (original) => ({
  ...(await original<typeof import("motion/react")>()),
  useReducedMotion: () => true,
}));
afterEach(() => vi.useRealTimers());
const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};
it("pauses reading time for hover/focus, replaces rapid undo/redo, closes and cleans up on load/unmount", async () => {
  vi.useFakeTimers();
  const d = setup();
  d.engine.load(
    createProject({
      pages: [
        createPage({
          layers: [createLayer("rectangle", { id: "item", name: "MELT", fill: "#8b5cf6" })],
        }),
      ],
    }),
  );
  const view = d.mount(<HistoryNotice engine={d.engine} />);
  act(() => d.engine.execute({ type: "updateLayers", ids: ["item"], patch: { fill: "#ff0000" } }));
  expect(screen.queryByRole("status")).toBeNull();
  act(() => d.engine.undo());
  const card = screen.getByRole("status", { name: "Annulé · Modifier Fond #8b5cf6 · MELT" });
  expect(card.querySelector("span")).toHaveTextContent("Annulé · Modifier Fond #8b5cf6 · MELT");
  await advance(1000);
  fireEvent.pointerOver(card);
  await advance(3000);
  expect(card).toBeVisible();
  act(() => d.engine.redo());
  expect(
    screen.getByRole("status", { name: "Rétabli · Modifier Fond #ff0000 · MELT" }),
  ).toBeVisible();
  const close = screen.getByRole("button", { name: "Fermer la notification" });
  act(() => close.focus());
  fireEvent.pointerOut(card);
  await advance(3000);
  expect(screen.getByRole("status")).toBeVisible();
  act(() => close.blur());
  await advance(1999);
  expect(screen.getByRole("status")).toBeVisible();
  await advance(1);
  expect(screen.queryByRole("status")).toBeNull();
  act(() => d.engine.undo());
  fireEvent.click(screen.getByRole("button", { name: "Fermer la notification" }));
  expect(screen.queryByRole("status")).toBeNull();
  act(() => d.engine.redo());
  expect(screen.getByRole("status")).toBeVisible();
  act(() => d.engine.load(createProject()));
  expect(screen.queryByRole("status")).toBeNull();
  view.unmount();
  await advance(3000);
  expect(screen.queryByRole("status")).toBeNull();
});
