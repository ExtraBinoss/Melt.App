import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { setup } from "../../../support/ui";
import { LayerTransitionContext } from "../../../../src/components/motion/transitions/LayerTransitionContext";
import { TransitionRequestHost } from "../../../../src/components/motion/transitions/TransitionRequestHost";
test("the row menu closes while its single permanent host keeps the transition editor alive", async () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.mount(
    <>
      <LayerTransitionContext engine={d.engine} compositionId={d.page.id} layerId={d.rectangle.id}>
        <div>Timeline row</div>
      </LayerTransitionContext>
      <TransitionRequestHost engine={d.engine} />
    </>,
  );
  fireEvent.contextMenu(screen.getByText("Timeline row"), { clientX: 70, clientY: 90 });
  await act(async () => {
    fireEvent.click(screen.getByRole("menuitem", { name: "Ajouter une animation" }));
  });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(await screen.findByRole("dialog", { name: "Ajouter une animation" })).toBeVisible();
  fireEvent.keyDown(screen.getByRole("dialog", { name: "Ajouter une animation" }), {
    key: "Escape",
  });
  expect(screen.queryByRole("dialog")).toBeNull();
});
test("an open stale row menu cannot convert or edit a same-ID replacement", async () => {
  const d = setup();
  d.mount(
    <LayerTransitionContext engine={d.engine} compositionId={d.page.id} layerId={d.rectangle.id}>
      <div>Row</div>
    </LayerTransitionContext>,
  );
  fireEvent.contextMenu(screen.getByText("Row"));
  d.engine.load(structuredClone(d.engine.getSnapshot().project));
  const before = d.engine.getSnapshot();
  await act(async () => {
    fireEvent.click(screen.getByRole("menuitem", { name: "Ajouter une animation" }));
  });
  expect(d.engine.getSnapshot()).toBe(before);
});
