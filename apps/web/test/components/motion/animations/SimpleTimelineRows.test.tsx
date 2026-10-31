import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { MOTION_ANIMATION_PRESETS, motionTimeToSeconds } from "@musart/core";
import { setup } from "../../../support/ui";
import { makeTransport, PanelHost } from "../support";
import { animationPresentation } from "../../../../src/components/motion/animations/presentation";
import { createTimelineHoverSource } from "../../../../src/state/motion/hover";
import { canvasContext } from "../canvas/support";

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext() as never);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300);
});
it("keeps canonical grouping, shared selection/hover, editable blocks and collapse state across views", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.execute({ type: "groupLayers", ids: [d.rectangle.id, d.text.id] });
  const group = d.engine
    .getSnapshot()
    .project.pages[0]!.layers.find((layer) => layer.kind === "group")!;
  const track = d.engine
    .getSnapshot()
    .project.pages[0]!.motion!.tracks.find((track) => track.layerId === d.rectangle.id)!;
  d.engine.execute({
    type: "addMotionAnimation",
    trackId: track.id,
    preset: MOTION_ANIMATION_PRESETS.find((preset) => preset.id === "move-left")!,
    start: { value: 0, rate: 1 },
    duration: { value: 1, rate: 1 },
  });
  const page = d.engine.getSnapshot().project.pages[0]!,
    runtime = makeTransport(page);
  animationPresentation(d.engine).set({ details: false });
  d.mount(<PanelHost engine={d.engine} transport={runtime.transport} />);
  const child = screen.getByRole("button", { name: "Sélectionner Rectangle bleu" });
  fireEvent.click(child);
  expect(d.engine.getSnapshot().selection).toEqual([d.rectangle.id]);
  const row = child.closest<HTMLElement>(".motion-row")!;
  fireEvent.pointerEnter(row);
  expect(createTimelineHoverSource(d.engine).read()?.layerId).toBe(d.rectangle.id);
  const animation =
    track.animations?.[0] ??
    d.engine.getSnapshot().project.pages[0]!.motion!.tracks.find((entry) => entry.id === track.id)!
      .animations![0]!;
  const block = document.querySelector<HTMLElement>(`button[data-animation-id="${animation.id}"]`)!;
  expect(block).toBeTruthy();
  fireEvent.keyDown(block, { key: "ArrowRight" });
  expect(
    motionTimeToSeconds(
      d.engine
        .getSnapshot()
        .project.pages[0]!.motion!.tracks.find((entry) => entry.id === track.id)!.animations![0]!
        .start,
    ),
  ).toBe(0.01);
  act(() => d.engine.undo());
  expect(
    d.engine.getSnapshot().project.pages[0]!.motion!.tracks.find((entry) => entry.id === track.id)!
      .animations![0]!.start.value,
  ).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: `Replier ${group.name}` }));
  expect(screen.queryByRole("button", { name: "Sélectionner Rectangle bleu" })).toBeNull();
  expect(createTimelineHoverSource(d.engine).read()).toBeNull();
  act(() => animationPresentation(d.engine).set({ details: true }));
  expect(screen.getByRole("button", { name: `Déplier ${group.name}` })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  fireEvent.click(screen.getByRole("button", { name: `Déplier ${group.name}` }));
  expect(screen.getByRole("button", { name: "Sélectionner Rectangle bleu" })).toBeTruthy();
});
