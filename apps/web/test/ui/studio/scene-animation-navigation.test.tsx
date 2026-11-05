import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { createSpatialScene, SCENE_MOTION_ANIMATION_PRESETS } from "@musart/core";
import { animationPresentation } from "../../../src/components/motion/animations/presentation";
import { StudioPropertyPopover } from "../../../src/ui/studio/controls/StudioPropertyPopover";
import { useSceneAnimationNavigation } from "../../../src/ui/studio/panels/use-scene-animation-navigation";
import { setup } from "../../support/ui";

it("opens the retained Advanced popover for light Edit requests and respects dismissal", async () => {
  const d = setup();
  const spatial = createSpatialScene();
  d.engine.execute({ type: "updatePage", patch: { spatial } });
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.execute({
    type: "addMotionAnimation",
    owner: {
      kind: "light",
      compositionId: d.engine.getSnapshot().pageId,
      lightId: spatial.lights[0]!.id,
    },
    preset: SCENE_MOTION_ANIMATION_PRESETS.find((preset) => preset.id === "scene-light-pulse")!,
    start: { value: 0, rate: 1 },
  });
  function View() {
    const request = useSceneAnimationNavigation(d.engine);
    return (
      <StudioPropertyPopover trigger={<button>Advanced</button>} openRequest={request}>
        <button>Light controls</button>
      </StudioPropertyPopover>
    );
  }
  d.mount(<View />);
  const presentation = animationPresentation(d.engine);
  const animationId = d.engine.getSnapshot().project.pages[0]!.motion!.sceneAnimations![0]!.id;
  expect(screen.queryByRole("button", { name: "Light controls" })).toBeNull();
  act(() => presentation.requestEditor(animationId));
  await waitFor(() => expect(screen.getByRole("button", { name: "Light controls" })).toBeVisible());
  fireEvent.keyDown(screen.getByRole("button", { name: "Light controls" }), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("button", { name: "Light controls" })).toBeNull());
  act(() => presentation.set({ selected: animationId }));
  expect(screen.queryByRole("button", { name: "Light controls" })).toBeNull();
  act(() => presentation.requestEditor(animationId));
  await waitFor(() => expect(screen.getByRole("button", { name: "Light controls" })).toBeVisible());
});
