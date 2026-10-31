import { expect, it } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  MOTION_ANIMATION_PRESETS,
  compileMotion,
  evaluateMotion,
  applyMotionFrame,
} from "../../src/index";

it("built-in motion recipes stay sparse and evaluation never bakes per-frame keyframes", () => {
  for (const preset of MOTION_ANIMATION_PRESETS)
    for (const channel of preset.channels) expect(channel.points.length).toBeLessThanOrEqual(8);
  for (const id of ["move-left", "blur-focus", "scale-grow", "rotate-clockwise"]) {
    const engine = new EditorEngine(
      createProject({
        pages: [
          createPage({ id: "page", layers: [createLayer("rectangle", { id: "subject", x: 300 })] }),
        ],
      }),
    );
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    const track = engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!;
    const preset = MOTION_ANIMATION_PRESETS.find((preset) => preset.id === id)!;
    expect(preset.channels.every((channel) => channel.points.length === 2)).toBe(true);
    engine.execute({
      type: "addMotionAnimation",
      trackId: track.id,
      preset,
      start: { value: 0, rate: 1 },
      duration: { value: 1, rate: 1 },
    });
    const before = engine.getSnapshot();
    const program = compileMotion(before.project, { compositionId: "page" });
    const middle = evaluateMotion(program, { value: 1, rate: 2 });
    expect(applyMotionFrame(program, middle)).not.toEqual(
      applyMotionFrame(program, evaluateMotion(program, { value: 0, rate: 1 })),
    );
    for (let frame = 0; frame < 240; frame++) evaluateMotion(program, { value: frame, rate: 240 });
    expect(engine.getSnapshot()).toBe(before);
    expect(before.project.pages[0]!.motion!.tracks[0]!.properties).toEqual([]);
    expect(before.project.pages[0]!.motion!.tracks[0]!.animations![0]!.preset.channels).toEqual(
      preset.channels,
    );
  }
});
