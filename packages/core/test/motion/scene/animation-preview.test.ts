import { expect, it, vi } from "vitest";
import {
  animationPointId,
  compileMotion,
  createMotionKeyframePreview,
  createPage,
  createProject,
  createSpatialScene,
  EditorEngine,
  SCENE_MOTION_ANIMATION_PRESETS,
} from "../../../src/index";
import * as interpolation from "../../../src/motion/interpolation";

it("retimes only the affected scene action and retains other owners' compiled channel identities", () => {
  const spatial = createSpatialScene();
  spatial.lights[0]!.id = "lamp";
  const engine = new EditorEngine(createProject({ pages: [createPage({ id: "scene", spatial })] }));
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  for (const id of ["scene-camera-orbit", "scene-light-pulse"]) {
    const preset = SCENE_MOTION_ANIMATION_PRESETS.find((preset) => preset.id === id)!;
    engine.execute({
      type: "addMotionAnimation",
      owner:
        id === "scene-camera-orbit"
          ? { kind: "camera", compositionId: "scene" }
          : { kind: "light", compositionId: "scene", lightId: "lamp" },
      preset,
      start: { value: 0, rate: 1 },
    });
  }
  const project = engine.getSnapshot().project,
    source = JSON.stringify(project);
  const program = compileMotion(project, { compositionId: "scene" });
  const authored = program.composition.motion!.sceneAnimations![0]!;
  expect(Object.isFrozen(project)).toBe(true);
  expect(Object.isFrozen(authored.preset.channels)).toBe(true);
  const untouched = program.sceneAnimations![1]!;
  const compile = vi.spyOn(interpolation, "compileMotionInterpolator");
  try {
    const preview = createMotionKeyframePreview(program, [animationPointId(authored.id, 0, 1)]);
    expect(compile).not.toHaveBeenCalled();
    const first = preview.sample({ value: 1, rate: 1 });
    expect(first.sceneAnimations![0]).not.toBe(program.sceneAnimations![0]);
    expect(first.sceneAnimations![1]).toBe(untouched);
    expect(compile).toHaveBeenCalledTimes(2); // The affected three-point camera channel alone.
    compile.mockClear();
    const second = preview.sample({ value: 2, rate: 1 });
    expect(second.sceneAnimations![0]).not.toBe(first.sceneAnimations![0]);
    expect(second.sceneAnimations![1]).toBe(untouched);
    expect(compile).toHaveBeenCalledTimes(2);
    compile.mockClear();
    expect(preview.sample({ value: 0, rate: 1 })).toBe(program);
    expect(compile).not.toHaveBeenCalled();
    expect(JSON.stringify(project)).toBe(source);
    expect(engine.getSnapshot().project).toBe(project);
    expect(authored.preset.channels[0]!.points[1]!.at).toBe(0.5);
  } finally {
    compile.mockRestore();
  }
});
