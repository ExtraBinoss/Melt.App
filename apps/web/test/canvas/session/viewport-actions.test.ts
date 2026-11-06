import { expect, it, vi } from "vitest";
import { EditorEngine } from "@musart/core";
import { createViewportActions } from "../../../src/canvas/session/viewport-actions";
import { subscribeEditorNotices } from "../../../src/components/notifications/source";
import { i18n } from "../../../src/state/i18n";
import { supportedLocales } from "../../../src/state/i18n/locales";

it("shares canvas actions per engine without queuing absent views or modifying documents", () => {
  const engine = new EditorEngine(),
    other = new EditorEngine(),
    port = createViewportActions(engine),
    baseline = engine.getSnapshot(),
    listener = vi.fn();
  expect(createViewportActions(engine)).toBe(port);
  expect(createViewportActions(other)).not.toBe(port);
  expect(port.run("fit")).toBe(false);
  const stop = port.subscribe(listener);
  expect(listener).not.toHaveBeenCalled();
  for (const action of ["zoomIn", "zoomOut", "reset", "recenter", "fit"] as const)
    expect(port.run(action)).toBe(true);
  expect(listener.mock.calls.map(([action]) => action)).toEqual([
    "zoomIn",
    "zoomOut",
    "reset",
    "recenter",
    "fit",
  ]);
  expect(engine.getSnapshot()).toBe(baseline);
  stop();
  stop();
  expect(port.run("reset")).toBe(false);
  expect(listener).toHaveBeenCalledTimes(5);
});

it("focuses a screen target through the mounted canvas and rejects invalid coordinates", () => {
  const engine = new EditorEngine(),
    port = createViewportActions(engine),
    listener = vi.fn();
  const before = engine.getSnapshot();
  expect(port.focus({ x: 300, y: 500, factor: 1.4 })).toBe(false);
  const stop = port.subscribeFocus(listener);
  expect(port.focus({ x: NaN, y: 500, factor: 1.4 })).toBe(false);
  expect(port.focus({ x: 300, y: 500, factor: 0 })).toBe(false);
  expect(port.focus({ x: 300, y: 500, factor: 1.4 })).toBe(true);
  expect(listener).toHaveBeenCalledExactlyOnceWith({ x: 300, y: 500, factor: 1.4 });
  expect(engine.getSnapshot()).toBe(before);
  stop();
  expect(port.focus({ x: 300, y: 500, factor: 1.4 })).toBe(false);
});

it("acknowledges only mounted recenter/reset actions through the session notice slot in every locale", () => {
  const engine = new EditorEngine(),
    other = new EditorEngine(),
    actions = createViewportActions(engine),
    notices = vi.fn(),
    otherNotices = vi.fn(),
    baseline = engine.getSnapshot();
  const stopNotice = subscribeEditorNotices(engine, notices);
  const stopOther = subscribeEditorNotices(other, otherNotices);
  actions.run("recenter");
  expect(notices).not.toHaveBeenCalled();
  const stopCanvas = actions.subscribe(() => {});
  const language = i18n.language;
  try {
    for (const { code } of supportedLocales) {
      void i18n.changeLanguage(code);
      for (const action of ["recenter", "reset"] as const) {
        actions.run(action);
        expect(notices).toHaveBeenLastCalledWith({
          title: i18n.getResource(code, "notices", "confirmed"),
          message: i18n.getResource(code, "notices", "viewRecentered"),
          error: false,
        });
      }
    }
    expect(notices).toHaveBeenCalledTimes(2 * supportedLocales.length);
    actions.run("fit");
    actions.run("zoomIn");
    actions.run("zoomOut");
    expect(notices).toHaveBeenCalledTimes(2 * supportedLocales.length);
    expect(otherNotices).not.toHaveBeenCalled();
    stopCanvas();
    actions.run("recenter");
    expect(notices).toHaveBeenCalledTimes(2 * supportedLocales.length);
    expect(engine.getSnapshot()).toBe(baseline);
  } finally {
    void i18n.changeLanguage(language);
    stopCanvas();
    stopNotice();
    stopOther();
  }
});
