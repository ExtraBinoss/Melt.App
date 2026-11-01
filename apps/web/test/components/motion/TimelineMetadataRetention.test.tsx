import type { ReactNode } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { MOTION_ANIMATION_PRESETS, motionTimeToSeconds } from "@musart/core";
import { setup } from "../../support/ui";
import { makeTransport, PanelHost } from "./support";
import { canvasContext } from "./canvas/support";
import { SimpleTimelineRows } from "../../../src/components/motion/animations/SimpleTimelineRows";
import { MotionSummaryBlock } from "../../../src/components/motion/animations/MotionSummaryBlock";
import { TrackClips } from "../../../src/components/motion/occurrences/TrackClips";
import { TimelineRowView } from "../../../src/components/motion/rows/TimelineRowView";
import { animationPresentation } from "../../../src/components/motion/animations/presentation";
import { getMotionOccurrenceSelection } from "../../../src/state/motion/occurrence-selection";

vi.mock("../../../src/components/motion/animations/MotionSummaryBlock", async (load) => {
  const actual = await load<{ MotionSummaryBlock: typeof MotionSummaryBlock }>();
  return { ...actual, MotionSummaryBlock: vi.fn(actual.MotionSummaryBlock) };
});
vi.mock("../../../src/components/motion/occurrences/TrackClips", async (load) => {
  const actual = await load<{ TrackClips: typeof TrackClips }>();
  return { ...actual, TrackClips: vi.fn(actual.TrackClips) };
});

// Spy on the real component body inside React.memo, retaining React's actual shallow boundary.
// This witnesses function execution rather than inferring it from DOM identity or commit counts.
type MemoBody = { type: (props: never) => ReactNode };

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext() as never);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(900);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300);
});

function fixture(details: boolean) {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const trackId = d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.id;
  d.engine.execute({
    type: "addMotionAnimation",
    trackId,
    preset: MOTION_ANIMATION_PRESETS.find((preset) => preset.id === "move-left")!,
    start: { value: 0, rate: 1 },
    duration: { value: 1, rate: 1 },
  });
  d.engine.execute({
    type: "upsertMotionKeyframe",
    target: { kind: "layer", layerId: d.rectangle.id, property: "opacity" },
    time: { value: 1, rate: 2 },
    value: 0.5,
  });
  d.engine.select([d.rectangle.id]);
  const page = () => d.engine.getSnapshot().project.pages[0]!;
  const animation = () =>
    page().motion!.tracks.find((track) => track.id === trackId)!.animations![0]!;
  const runtime = makeTransport(page());
  animationPresentation(d.engine).set({ details });
  return { ...d, page, animation, trackId, runtime };
}

it.each([false, true])(
  "retains actual row execution across Solid/Gradient undo and redo (details=%s), then edits the live owner",
  async (details) => {
    const d = fixture(details);
    const simple = vi.spyOn(SimpleTimelineRows as unknown as MemoBody, "type");
    const rows = vi.spyOn(TimelineRowView as unknown as MemoBody, "type");
    const summary = vi.mocked(MotionSummaryBlock),
      clips = vi.mocked(TrackClips);
    summary.mockClear();
    clips.mockClear();
    const view = d.mount(<PanelHost engine={d.engine} transport={d.runtime.transport} />);
    const executions = () => [
      simple.mock.calls.length,
      rows.mock.calls.length,
      summary.mock.calls.length,
      clips.mock.calls.length,
    ];
    const initial = executions();
    expect(initial[1]).toBeGreaterThan(0);
    if (!details) {
      expect(initial[0]).toBeGreaterThan(0);
      expect(initial[2]).toBeGreaterThan(0);
      expect(initial[3]).toBeGreaterThan(0);
    }
    for (const patch of [
      { background: "#123456" },
      {
        backgroundGradient: {
          kind: "linear" as const,
          angle: 45,
          stops: [
            { offset: 0, color: "#123456" },
            { offset: 1, color: "#ffffff" },
          ],
        },
      },
    ]) {
      act(() => d.engine.execute({ type: "updatePage", patch }));
      expect(executions()).toEqual(initial);
      act(() => d.engine.undo());
      expect(executions()).toEqual(initial);
      act(() => d.engine.redo());
      expect(executions()).toEqual(initial);
    }
    if (!details) {
      const clip = view.container.querySelector<HTMLButtonElement>(
        `[data-track-id="${d.trackId}"] .motion-track`,
      )!;
      fireEvent.click(clip);
      expect(getMotionOccurrenceSelection(d.engine).read(d.page(), d.rectangle.id)).toBe(d.trackId);
      const block = view.container.querySelector<HTMLButtonElement>(
        `button[data-animation-id="${d.animation().id}"]`,
      )!;
      fireEvent.contextMenu(block);
      fireEvent.click(await screen.findByRole("menuitem", { name: "Dupliquer l’animation" }));
      expect(
        d.page().motion!.tracks.find((track) => track.id === d.trackId)!.animations,
      ).toHaveLength(2);
      act(() => d.engine.undo());
      expect(
        d.page().motion!.tracks.find((track) => track.id === d.trackId)!.animations,
      ).toHaveLength(1);
      fireEvent.keyDown(block, { key: "ArrowRight" });
      expect(motionTimeToSeconds(d.animation().start)).toBe(0.01);
      act(() => d.engine.undo());
      expect(motionTimeToSeconds(d.animation().start)).toBe(0);
      act(() => d.engine.redo());
      expect(motionTimeToSeconds(d.animation().start)).toBe(0.01);
    }
    fireEvent.click(screen.getByRole("button", { name: "Sélectionner Titre" }));
    expect(d.engine.getSnapshot().selection).toEqual([d.text.id]);
    expect(view.container.querySelector(`[data-layer-id="${d.text.id}"].motion-row`)).toHaveClass(
      "is-selected",
    );
    const beforeLoad = executions();
    act(() => d.engine.load(d.engine.getSnapshot().project));
    expect(rows.mock.calls.length).toBeGreaterThan(beforeLoad[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Sélectionner Rectangle bleu" }));
    expect(d.engine.getSnapshot().selection).toEqual([d.rectangle.id]);
    expect(
      view.container.querySelector(`[data-layer-id="${d.rectangle.id}"].motion-row`),
    ).toHaveClass("is-selected");
    view.unmount();
  },
);
