import { act, fireEvent, screen } from "@testing-library/react";
import { useState, type ComponentProps } from "react";
import { expect, test, vi } from "vitest";
import { createProject, createPage, createLayer, planMotionInitialization } from "@musart/core";
import { MotionDiamond } from "../../../../src/components/properties/motion/MotionDiamond";
import { useEngine } from "../../../../src/state/session/editor";
import { setup } from "../../../support/ui";
import { animationPresentation } from "../../../../src/components/motion/animations/presentation";
const renders = vi.hoisted(() => vi.fn());
vi.mock("../../../../src/components/ui/tooltip", async () => {
  const actual = await vi.importActual<typeof import("../../../../src/components/ui/tooltip")>(
    "../../../../src/components/ui/tooltip",
  );
  return {
    ...actual,
    Tooltip: (props: ComponentProps<typeof actual.Tooltip>) => {
      renders();
      return <actual.Tooltip {...props} />;
    },
  };
});
test("retains unchanged diamond/tooltips through history while its binding follows keys, locks and owners", () => {
  const d = setup();
  animationPresentation(d.engine).set({ details: true });
  function Harness() {
    useEngine(d.engine);
    const [property, setProperty] = useState<"x" | "width">("x");
    return (
      <>
        <button onClick={() => setProperty("width")}>Width target</button>
        <MotionDiamond
          engine={d.engine}
          target={{ kind: "layer", layerId: d.rectangle.id, property }}
          targets={[{ kind: "layer", layerId: d.rectangle.id, property }]}
          label="Value"
        />
      </>
    );
  }
  const view = d.mount(<Harness />);
  const hiddenRenders = renders.mock.calls.length;
  expect(document.querySelector("[data-motion-diamond]")).toBeNull();
  act(() => d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { y: 57 } }));
  act(() => d.engine.undo());
  act(() => d.engine.redo());
  expect(renders).toHaveBeenCalledTimes(hiddenRenders);
  expect(document.querySelector("[data-motion-diamond]")).toBeNull();
  act(() =>
    d.engine.execute({
      type: "setCompositionMode",
      mode: "motion",
      plan: planMotionInitialization(d.engine.getSnapshot()),
    }),
  );
  const node = document.querySelector<HTMLButtonElement>("[data-motion-diamond]")!;
  const initial = renders.mock.calls.length;
  expect(node).not.toBeNull();
  fireEvent.click(node);
  expect(node).toHaveAttribute("data-current", "true");
  expect(renders).toHaveBeenCalledTimes(initial);
  fireEvent.click(screen.getByRole("button", { name: "Width target" }));
  expect(renders).toHaveBeenCalledTimes(initial + 1);
  fireEvent.click(node);
  const tracks = d.engine.getSnapshot().project.pages[0]!.motion!.tracks;
  expect(
    tracks.flatMap((track) => track.properties).map((property) => property.target.property),
  ).toContain("width");
  act(() =>
    d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { locked: true } }),
  );
  expect(node).toBeDisabled();
  expect(renders).toHaveBeenCalledTimes(initial + 1);
  act(() =>
    d.engine.load(
      createProject({
        id: "replacement",
        pages: [
          createPage({
            id: "replacement-page",
            layers: [createLayer("rectangle", { ...d.rectangle, locked: false })],
          }),
        ],
      }),
    ),
  );
  expect(renders).toHaveBeenCalledTimes(initial + 1);
  expect(document.querySelector("[data-motion-diamond]")).toBeNull();
  expect(screen.queryByRole("tooltip")).toBeNull();
  view.unmount();
});
