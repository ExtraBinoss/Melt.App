import "../../../src/state/i18n";
import { Profiler } from "react";
import { act, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import * as core from "@musart/core";
import { SceneMotionField } from "../../../src/components/spatial/SceneMotionField";
import { hasSceneMotionKeys } from "../../../src/components/motion/scene/properties";
import { createMotionTransport } from "../../../src/services/motion/transport";
import { TooltipProvider } from "../../../src/components/ui/tooltip";
import { animationPresentation } from "../../../src/components/motion/animations/presentation";
function fixture() {
  const engine = new core.EditorEngine(
    core.createProject({
      pages: [core.createPage({ id: "scene", spatial: core.createSpatialScene() })],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({
    type: "addMotionAnimation",
    owner: { kind: "camera", compositionId: "scene" },
    preset: core.SCENE_MOTION_ANIMATION_PRESETS.find(
      (preset) => preset.id === "scene-camera-orbit",
    )!,
    start: { value: 0, rate: 1 },
  });
  return {
    engine,
    target: { kind: "camera", compositionId: "scene", property: "yaw" } as const,
    page: () => engine.getSnapshot().project.pages[0]!,
  };
}
it("reads scene animation presence without accessing action points and retains immutable metadata across repeated queries", () => {
  const d = fixture(),
    bind = vi.spyOn(core, "sceneAnimationTarget");
  expect(hasSceneMotionKeys(d.page(), d.target)).toBe(true);
  const calls = bind.mock.calls.length;
  expect(calls).toBe(1);
  for (let i = 0; i < 30; i++) expect(hasSceneMotionKeys(d.page(), d.target)).toBe(true);
  expect(bind).toHaveBeenCalledTimes(calls);
  const external = structuredClone(d.page());
  const channel = external.motion!.sceneAnimations![0]!.preset.channels[0]!;
  const points = vi.fn(() => {
    throw Error("Presence must not read/project point arrays");
  });
  Object.defineProperty(channel, "points", { get: points });
  expect(hasSceneMotionKeys(external, d.target)).toBe(true);
  expect(points).not.toHaveBeenCalled();
  d.engine.execute({
    type: "deleteMotionAnimation",
    animationId: d.page().motion!.sceneAnimations![0]!.id,
  });
  expect(hasSceneMotionKeys(d.page(), d.target)).toBe(false);
  d.engine.undo();
  expect(hasSceneMotionKeys(d.page(), d.target)).toBe(true);
});
it("updates diamonds imperatively during transport without point projection or metadata recomputation, then follows commit/undo", () => {
  const d = fixture(),
    transport = createMotionTransport(d.engine);
  animationPresentation(d.engine).set({ details: true });
  const project = vi.spyOn(core, "projectSceneMotionProperties"),
    bind = vi.spyOn(core, "sceneAnimationTarget"),
    commits = vi.fn();
  const view = render(
    <TooltipProvider>
      <Profiler id="scene-diamond" onRender={commits}>
        <SceneMotionField engine={d.engine} target={d.target} label="Azimuth">
          <span>Azimuth</span>
        </SceneMotionField>
      </Profiler>
    </TooltipProvider>,
  );
  const diamond = view.container.querySelector<HTMLButtonElement>("[data-motion-diamond]")!;
  expect(diamond.dataset.animated).toBe("true");
  act(() => transport.seek({ value: 1, rate: 10 }));
  const metadataCalls = bind.mock.calls.length,
    renders = commits.mock.calls.length;
  for (let i = 2; i <= 30; i++) act(() => transport.seek({ value: i, rate: 10 }));
  expect(project).not.toHaveBeenCalled();
  expect(bind).toHaveBeenCalledTimes(metadataCalls);
  expect(commits).toHaveBeenCalledTimes(renders);
  act(() =>
    d.engine.execute({
      type: "deleteMotionAnimation",
      animationId: d.page().motion!.sceneAnimations![0]!.id,
    }),
  );
  expect(diamond.dataset.animated).toBe("false");
  act(() => d.engine.undo());
  expect(diamond.dataset.animated).toBe("true");
  view.unmount();
});
