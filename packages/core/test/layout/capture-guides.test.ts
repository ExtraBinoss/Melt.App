import { expect, test } from "vitest";
import { parseProject, serializeProject, type CaptureGuides } from "../../src/index";
import { setup } from "../support/fixture";

const captureGuides: CaptureGuides = {
  preset: "custom",
  width: 1080,
  height: 1920,
  full: false,
  visible: true,
  color: "cyan",
  center: false,
  safeArea: "custom",
  margin: 10,
};

test("authored capture inputs validate, serialize and use one ordinary undo transaction without resizing artwork", () => {
  const d = setup();
  const before = d.engine.getSnapshot();
  d.engine.execute({ type: "updatePage", patch: { captureGuides } });
  const committed = d.engine.getSnapshot();
  expect(d.page().captureGuides).toEqual(captureGuides);
  expect(d.page().width).toBe(before.project.pages[0]!.width);
  expect(d.page().height).toBe(before.project.pages[0]!.height);
  expect(d.page().layers).toBe(before.project.pages[0]!.layers);
  expect(parseProject(serializeProject(committed.project)).pages[0]!.captureGuides).toEqual(
    captureGuides,
  );
  d.engine.undo();
  expect(d.page().captureGuides).toBeUndefined();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  d.engine.redo();
  expect(d.engine.getSnapshot().project).toEqual(committed.project);
});

test("invalid capture metadata rejects atomically and preserves the prior undo endpoint", () => {
  const d = setup();
  const before = d.engine.getSnapshot();
  for (const patch of [
    { width: 0 },
    { height: 1.5 },
    { width: 16385 },
    { margin: -1 },
    { margin: 41 },
    { margin: NaN },
    { color: "blue" },
    { center: "yes" },
    { safeArea: "platform" },
    { preset: "" },
    { extra: true },
  ]) {
    expect(() =>
      d.engine.execute({
        type: "updatePage",
        patch: { captureGuides: { ...captureGuides, ...patch } as CaptureGuides },
      }),
    ).toThrow();
    expect(d.engine.getSnapshot()).toBe(before);
  }
  expect(() =>
    d.engine.transaction([
      { type: "updatePage", patch: { captureGuides } },
      { type: "updatePage", patch: { captureGuides: { ...captureGuides, width: 0 } } },
    ]),
  ).toThrow();
  expect(d.engine.getSnapshot()).toBe(before);
});
