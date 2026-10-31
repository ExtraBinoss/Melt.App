import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { MOTION_ANIMATION_PRESETS } from "@musart/core";
import { setup } from "../../../support/ui";
import { makeTransport, PanelHost } from "../support";
import { canvasContext } from "../canvas/support";
import { LayerAnimations } from "../../../../src/components/motion/animations/LayerAnimations";
import { animationPresentation } from "../../../../src/components/motion/animations/presentation";

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext() as never);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
});

it("shows direct group keyframes in Animations and explains inherited movement on the child", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.execute({ type: "groupLayers", ids: [d.rectangle.id, d.text.id] });
  const group = d.engine
    .getSnapshot()
    .project.pages[0]!.layers.find((layer) => layer.kind === "group")!;
  for (const value of [0, 1])
    d.engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: group.id, property: "rotation" },
      time: { value, rate: 1 },
      value: value * 360,
    });
  const page = d.engine.getSnapshot().project.pages[0]!,
    runtime = makeTransport(page);
  d.mount(
    <>
      <PanelHost engine={d.engine} transport={runtime.transport} />
      <LayerAnimations engine={d.engine} layerId={d.rectangle.id} />
    </>,
  );
  expect(document.querySelectorAll(".motion-summary-block")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Rotation, 1000 ms" })).toBeVisible();
  expect(screen.queryByText("Aucune animation")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: `Animé par ${group.name}` }));
  expect(d.engine.getSnapshot().selection).toEqual([group.id]);
  const block = screen.getByRole("button", { name: "Rotation, 1000 ms" });
  fireEvent.keyDown(block, { key: "ArrowRight" });
  const property = () =>
    d.engine
      .getSnapshot()
      .project.pages[0]!.motion!.tracks.find((track) => track.layerId === group.id)!.properties[0]!;
  expect(property().keyframes[0]!.time).toEqual({ value: 1, rate: 100 });
  expect(property().keyframes).toHaveLength(2);
  act(() => d.engine.undo());
  expect(property().keyframes[0]!.time.value).toBe(0);
  fireEvent.doubleClick(block);
  expect(animationPresentation(d.engine).read().details).toBe(true);
});

it("clears the active animation when another canonical layer is selected", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const track = d.engine
    .getSnapshot()
    .project.pages[0]!.motion!.tracks.find((track) => track.layerId === d.rectangle.id)!;
  d.engine.execute({
    type: "addMotionAnimation",
    trackId: track.id,
    preset: MOTION_ANIMATION_PRESETS.find((item) => item.id === "move-left")!,
    start: { value: 0, rate: 1 },
  });
  const page = d.engine.getSnapshot().project.pages[0]!,
    animation = page.motion!.tracks.find((item) => item.id === track.id)!.animations![0]!;
  d.mount(<PanelHost engine={d.engine} transport={makeTransport(page).transport} />);
  fireEvent.click(document.querySelector<HTMLElement>(`[data-animation-id="${animation.id}"]`)!);
  expect(animationPresentation(d.engine).read().selected).toBe(animation.id);
  act(() => d.engine.select([d.text.id]));
  expect(animationPresentation(d.engine).read().selected).toBeNull();
  expect(document.querySelector(".motion-row.is-selected")?.getAttribute("data-layer-id")).toBe(
    d.text.id,
  );
});
