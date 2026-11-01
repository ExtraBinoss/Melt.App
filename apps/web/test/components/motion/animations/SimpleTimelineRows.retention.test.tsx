import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { motionTimeToSeconds } from "@musart/core";
import { setup } from "../../../support/ui";
import { makeTransport, PanelHost, pointer } from "../support";
import { animationPresentation } from "../../../../src/components/motion/animations/presentation";
import { canvasContext } from "../canvas/support";

vi.mock("../../../../src/components/motion/animations/PresetPreview", () => ({
  PresetPreview: () => null,
}));

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext() as never);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300);
});

it("retains layer leaves across background edits while selection, motion controls and trim read the canonical page", () => {
  const previousUrl = location.href;
  history.replaceState(null, "", "?automation=1");
  try {
    const d = setup();
    d.engine.execute({ type: "setCompositionMode", mode: "motion" });
    animationPresentation(d.engine).set({ details: false });
    const page = d.engine.getSnapshot().project.pages[0]!;
    const runtime = makeTransport(page);
    const view = d.mount(<PanelHost engine={d.engine} transport={runtime.transport} />);
    const name = screen.getByRole("button", { name: "Sélectionner Rectangle bleu" });
    const row = name.closest<HTMLElement>(".motion-row")!;
    const commits = row.getAttribute("data-react-renders");
    const clip = row.querySelector<HTMLElement>(".motion-track")!;
    const trackId = row.querySelector<HTMLElement>("[data-track-id]")!.dataset.trackId;
    act(() => d.engine.execute({ type: "updatePage", patch: { background: "#112233" } }));
    expect(row.getAttribute("data-react-renders")).toBe(commits);
    expect(row.querySelector(".motion-track")).toBe(clip);
    fireEvent.click(clip);
    expect(d.engine.getSnapshot().selection).toEqual([d.rectangle.id]);
    fireEvent.click(name);
    expect(d.engine.getSnapshot().selection).toEqual([d.rectangle.id]);
    // The retained Add motion button still resolves its owner's current document.
    const addMotion = within(row).getByRole("button", { name: "Ajouter une animation" });
    fireEvent.click(addMotion);
    expect(screen.getByRole("dialog", { name: "Ajouter une animation" })).toBeVisible();
    fireEvent.click(addMotion);
    expect(screen.queryByRole("dialog", { name: "Ajouter une animation" })).toBeNull();
    const beforeTrim = d.engine.getSnapshot().project;
    const trim = row.querySelector<HTMLElement>(".motion-trim-handle.is-start")!;
    act(() => pointer(trim, "pointerdown", 100));
    act(() => pointer(trim, "pointermove", 130));
    act(() => pointer(trim, "pointerup", 130));
    const current = d.engine.getSnapshot().project.pages[0]!;
    expect(current.background).toBe("#112233");
    expect(
      motionTimeToSeconds(current.motion!.tracks.find((track) => track.id === trackId)!.start),
    ).toBe(0.25);
    act(() => d.engine.undo());
    expect(d.engine.getSnapshot().project).toBe(beforeTrim);
    // A movable clip needs room inside the composition's existing duration.
    act(() =>
      d.engine.execute({
        type: "setMotionTrackRange",
        trackId: trackId!,
        start: { value: 0, rate: 1 },
        end: { value: 3, rate: 2 },
      }),
    );
    const beforeMove = d.engine.getSnapshot().project;
    act(() => d.engine.execute({ type: "reorderLayer", id: d.rectangle.id, index: 1 }));
    act(() => d.engine.undo());
    expect(d.engine.getSnapshot().project).toBe(beforeMove);
    const movable = row.querySelector<HTMLElement>(".motion-track")!;
    act(() => pointer(movable, "pointerdown", 100));
    act(() => pointer(movable, "pointermove", 160, 1));
    act(() => pointer(movable, "pointerup", 160, 1));
    const moved = d.engine.getSnapshot().project.pages[0]!;
    expect(moved.motion!.tracks.find((track) => track.id === trackId)!.start).toEqual({
      value: 1,
      rate: 2,
    });
    expect(moved.background).toBe("#112233");
    act(() => d.engine.undo());
    expect(d.engine.getSnapshot().project).toBe(beforeMove);
    view.unmount();
  } finally {
    history.replaceState(null, "", previousUrl);
  }
});
