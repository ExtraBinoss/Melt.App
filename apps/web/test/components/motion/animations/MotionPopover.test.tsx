import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { MotionPopover } from "../../../../src/components/motion/animations/MotionPopover";
import { captureTransitionOrigin } from "../../../../src/components/motion/transitions/authoring";
import { setup } from "../../../support/ui";
import { makeTransport } from "../support";
import "../../../../src/components/motion/animations/messages";

// Native rendering is covered by the real-browser preset suite.
vi.mock("../../../../src/components/motion/animations/PresetPreview", () => ({
  PresetPreview: () => null,
}));
function fixture() {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const page = d.engine.getSnapshot().project.pages[0]!;
  return { ...d, page, transport: makeTransport(page).transport };
}

test("closed controls do not read the document on initial render or selection target changes", () => {
  const d = fixture(),
    read = vi.spyOn(d.engine, "getSnapshot");
  const props = { engine: d.engine, compositionId: d.page.id, transport: d.transport };
  const mount = d.mount(<MotionPopover {...props} layerId={d.rectangle.id} />);
  mount.rerender(<MotionPopover {...props} layerId={d.text.id} />);
  expect(read).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Ajouter une animation" })).toBeEnabled();
});

test("opening after a closed target change resolves the current text subject and restores trigger focus on Escape", async () => {
  const d = fixture(),
    user = userEvent.setup();
  const props = { engine: d.engine, compositionId: d.page.id, transport: d.transport };
  const mount = d.mount(<MotionPopover {...props} layerId={d.rectangle.id} />);
  act(() => d.engine.select([d.text.id]));
  mount.rerender(<MotionPopover {...props} layerId={d.text.id} />);
  const before = d.engine.getSnapshot(),
    trigger = screen.getByRole("button", { name: "Ajouter une animation" });
  await user.click(trigger);
  expect(screen.getByRole("dialog", { name: "Ajouter une animation" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Typographie" })).toBeVisible();
  expect(d.transport.pause).toHaveBeenCalledOnce();
  expect(d.engine.getSnapshot()).toBe(before);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(trigger).toHaveFocus();
});

test("a supplied origin opens the correct subject immediately, while disabled origins stay closed without reads", async () => {
  const d = fixture(),
    user = userEvent.setup();
  const origin = captureTransitionOrigin(d.engine, d.page.id, d.text.id)!;
  const props = {
    engine: d.engine,
    compositionId: d.page.id,
    layerId: d.text.id,
    transport: d.transport,
    initialOrigin: origin,
  };
  const read = vi.spyOn(d.engine, "getSnapshot");
  const mount = d.mount(<MotionPopover {...props} disabled />);
  await user.click(screen.getByRole("button", { name: "Ajouter une animation" }));
  expect(read).not.toHaveBeenCalled();
  expect(d.transport.pause).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
  mount.rerender(<MotionPopover {...props} />);
  expect(screen.getByRole("dialog", { name: "Ajouter une animation" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Typographie" })).toBeVisible();
});
