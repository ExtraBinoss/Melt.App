import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import {
  MOTION_ANIMATION_PRESETS,
  compileMotion,
  evaluateMotion,
  applyMotionFrame,
} from "@musart/core";
import { setup } from "../../../support/ui";
import { RotationControls } from "../../../../src/components/motion/animations/RotationControls";
import { useEngineValue } from "../../../../src/state/session/editor";

it.each([
  ["rotate-spin", 1],
  ["rotate-spin-reverse", -1],
] as const)("edits %s through simple turns with linear sampling and undo", (id, sign) => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const trackId = d.engine
    .getSnapshot()
    .project.pages[0]!.motion!.tracks.find((track) => track.layerId === d.rectangle.id)!.id;
  d.engine.execute({
    type: "addMotionAnimation",
    trackId,
    preset: MOTION_ANIMATION_PRESETS.find((preset) => preset.id === id)!,
    start: { value: 0, rate: 1 },
    duration: { value: 1, rate: 1 },
  });
  const animation = () =>
    d.engine.getSnapshot().project.pages[0]!.motion!.tracks.find((track) => track.id === trackId)!
      .animations![0]!;
  function Controls() {
    useEngineValue(d.engine, (snapshot) => snapshot.project);
    return (
      <RotationControls
        engine={d.engine}
        animation={animation()}
        disabled={false}
        run={(action) => action()}
      />
    );
  }
  d.mount(<Controls />);
  const before = d.engine.getSnapshot().project;
  const input = screen.getByRole("textbox", { name: "Tours" });
  fireEvent.change(input, { target: { value: "3" } });
  fireEvent.blur(input);
  expect(animation().preset.channels[0]!.points[1]!.value).toBe(1080 * sign);
  const project = d.engine.getSnapshot().project,
    page = project.pages[0]!;
  expect(page.motion!.tracks.every((track) => !track.properties.length)).toBe(true);
  const program = compileMotion(project, { compositionId: page.id });
  for (const time of [0.75, 0.25, 0.5]) {
    const sampled = applyMotionFrame(
      program,
      evaluateMotion(program, { value: time * 1000, rate: 1000 }),
    );
    expect(sampled.layers.find((layer) => layer.id === d.rectangle.id)!.rotation).toBeCloseTo(
      time * 1080 * sign,
    );
  }
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before);
});
