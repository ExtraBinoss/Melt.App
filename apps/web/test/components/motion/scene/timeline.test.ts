import type { PointerEvent } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialScene,
  createSpatialLayer,
  EditorEngine,
  projectSceneMotionProperties,
  SCENE_MOTION_ANIMATION_PRESETS,
} from "@musart/core";
import { projectTimelineRows } from "../../../../src/components/motion/tree";
import { projectSceneTimelineRows } from "../../../../src/components/motion/scene/tree";
import { simpleSceneRows } from "../../../../src/components/motion/scene/SimpleSceneTimelineRow";
import {
  projectTimelineCanvas,
  hitTestTimelineCanvas,
} from "../../../../src/components/motion/canvas/projection";
import {
  createTimelineSelectionIndex,
  selectedRangeKeys,
} from "../../../../src/components/motion/selection/ranges";
import { createTimelineGestures } from "../../../../src/components/motion/gestures";
import { captureEasingOrigin, commitEasing } from "../../../../src/components/motion/easing/model";
import { makeTransport } from "../support";

function fixture() {
  const scene = createSpatialScene();
  scene.lights = [{ ...scene.lights[0]!, id: "light" }];
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "scene",
          spatial: scene,
          layers: [createLayer("rectangle", { id: "card" })],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({ type: "setMotionDuration", duration: { value: 12, rate: 1 } });
  engine.execute({
    type: "addMotionAnimation",
    owner: { kind: "camera", compositionId: "scene" },
    preset: SCENE_MOTION_ANIMATION_PRESETS.find((preset) => preset.id === "scene-camera-orbit")!,
    start: { value: 0, rate: 1 },
  });
  for (const value of [1, 3])
    engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "environment", compositionId: "scene", property: "intensity" },
      time: { value, rate: 1 },
      value,
    });
  engine.execute({
    type: "upsertMotionKeyframe",
    target: { kind: "layer", layerId: "card", property: "x" },
    time: { value: 2, rate: 1 },
    value: 20,
  });
  return { engine, page: () => engine.getSnapshot().project.pages[0]! };
}
afterEach(() => {
  document.body.innerHTML = "";
});
it("projects genuine scene owners in both views and mixes scene/layer marquee keys on the same canvas", () => {
  const d = fixture(),
    page = d.page();
  const sceneRows = projectSceneTimelineRows(page, new Set(), true);
  expect(sceneRows.filter((row) => row.kind === "scene").map((row) => row.owner)).toEqual([
    { kind: "camera", compositionId: "scene" },
    { kind: "environment", compositionId: "scene" },
    { kind: "light", compositionId: "scene", lightId: "light" },
  ]);
  expect(sceneRows.every((row) => !("layer" in row))).toBe(true);
  const camera = sceneRows.find((row) => row.kind === "scene" && row.subject === "camera")!;
  if (camera.kind !== "scene") throw Error("Missing camera owner");
  expect(
    simpleSceneRows(camera)
      .map((row) => row.animation?.id)
      .filter(Boolean),
  ).toEqual([page.motion!.sceneAnimations![0]!.id]);
  expect(
    projectSceneTimelineRows(page, new Set([camera.key]), true).filter(
      (row) => row.subject === "camera",
    ),
  ).toHaveLength(1);
  const rows = [...projectTimelineRows(page, new Set()), ...sceneRows];
  const model = {
    rows,
    audioTracks: [],
    assets: {},
    selectedLayerIds: new Set<string>(),
    selectedKeyIds: new Set<string>(),
    scale: 100,
    duration: 12,
    rowHeight: 24,
    gutter: 244,
  };
  const canvas = projectTimelineCanvas(model, {
    left: 0,
    top: 0,
    width: 1000,
    height: rows.length * 24,
  });
  const cameraAt = rows.findIndex(
    (row) => row.kind === "sceneProperty" && row.subject === "camera",
  );
  expect(hitTestTimelineCanvas(canvas, 400, cameraAt * 24 + 12)).toMatchObject({
    kind: "key",
    rowKey: rows[cameraAt]!.key,
  });
  expect(hitTestTimelineCanvas(canvas, 400, cameraAt * 24 + 12)).not.toHaveProperty("layerId");
  const ranges = createTimelineSelectionIndex(rows, 24).query({
    top: 0,
    bottom: rows.length * 24,
    start: 0,
    end: 9,
  });
  const selected = selectedRangeKeys(ranges, new Set());
  expect(selected.size).toBe(6);
  expect(ranges.some((range) => range.layerId === "card")).toBe(true);
  expect(ranges.some((range) => range.layerId === undefined)).toBe(true);
});
it("shares one undoable scene/mixed-key gesture, preserves selection after origin refresh and cancels without edits", () => {
  const d = fixture(),
    page = d.page();
  const sceneKey = page.motion!.sceneProperties![0]!.keyframes[0]!;
  const layerKey = page.motion!.tracks[0]!.properties[0]!.keyframes[0]!;
  const root = document.createElement("section"),
    viewport = document.createElement("div"),
    button = document.createElement("button"),
    feedback = document.createElement("output");
  root.append(viewport, button, feedback);
  document.body.append(root);
  const runtime = makeTransport(page),
    errors = vi.fn();
  const gesture = createTimelineGestures({
    engine: d.engine,
    transport: runtime.transport,
    compositionId: page.id,
    onSelection: () => {},
    onError: errors,
  });
  gesture.connect({ root, viewport, scale: 100, feedback });
  const snapshot = d.engine.getSnapshot();
  const input = {
    currentTarget: button,
    button: 0,
    pointerId: 7,
    clientX: 100,
    clientY: 0,
    shiftKey: false,
    preventDefault() {},
    stopPropagation() {},
  } as unknown as PointerEvent<HTMLElement>;
  const send = (type: string, x: number) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x });
    Object.defineProperty(event, "pointerId", { value: 7 });
    button.dispatchEvent(event);
  };
  gesture.beginKey(input, undefined, sceneKey, [sceneKey.id, layerKey.id]);
  send("pointermove", 150);
  expect(d.engine.getSnapshot().project).toBe(snapshot.project);
  send("pointerup", 150);
  expect(errors).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot().revision).toBe(snapshot.revision + 1);
  expect(d.page().motion!.sceneProperties![0]!.keyframes[0]!.time).toEqual({ value: 3, rate: 2 });
  expect(d.page().motion!.tracks[0]!.properties[0]!.keyframes[0]!.time).toEqual({
    value: 5,
    rate: 2,
  });
  expect(d.engine.getSnapshot().selection).toEqual([]);
  gesture.updateOrigin(snapshot.project.id, d.engine.getSnapshot().revision);
  expect(gesture.readSelected()).toEqual(new Set([sceneKey.id, layerKey.id]));
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toBe(snapshot.project);
  gesture.updateOrigin(snapshot.project.id, d.engine.getSnapshot().revision);
  gesture.beginKey(input, undefined, sceneKey);
  send("pointermove", 125);
  gesture.cancel();
  expect(d.engine.getSnapshot().project).toBe(snapshot.project);
  gesture.dispose();
});
it("edits ordinary scene and derived-action easing through the same captured revision contract", () => {
  const d = fixture(),
    page = d.page();
  const owner = { kind: "camera", compositionId: page.id } as const;
  const actionProperty = projectSceneMotionProperties(page, owner)[0]!;
  const origin = captureEasingOrigin(
    d.engine,
    page.id,
    actionProperty.id,
    actionProperty.keyframes[1]!.id,
  );
  expect(commitEasing(d.engine, origin, { type: "hold" })).toBe("committed");
  expect(d.page().motion!.sceneAnimations![0]!.preset.channels[0]!.points[1]!.easing).toEqual({
    type: "hold",
  });
  d.engine.undo();
  const direct = d.page().motion!.sceneProperties![0]!;
  const key = direct.keyframes[1]!;
  const base = captureEasingOrigin(d.engine, page.id, direct.id, key.id);
  commitEasing(d.engine, base, { type: "spring", bounce: 0.2 });
  expect(d.page().motion!.sceneProperties![0]!.keyframes[1]!.easing).toEqual({
    type: "spring",
    bounce: 0.2,
  });
  expect(() => commitEasing(d.engine, base, { type: "linear" })).toThrow("changed");
});

it("projects default-scene camera/environment for native 3D and scene actions without fabricating lights", () => {
  const d = fixture();
  const native = {
    ...d.page(),
    spatial: undefined,
    motion: { ...d.page().motion!, sceneAnimations: [], sceneProperties: [] },
    layers: [createLayer("rectangle", { spatial: createSpatialLayer("box") })],
  };
  const owners = (page: typeof native) =>
    projectSceneTimelineRows(page, new Set(), true)
      .filter((row) => row.kind === "scene")
      .map((row) => row.owner);
  expect(owners(native)).toEqual([
    { kind: "camera", compositionId: "scene" },
    { kind: "environment", compositionId: "scene" },
  ]);
  expect(owners({ ...native, layers: [] })).toEqual([]);
  expect(
    projectSceneTimelineRows({ ...d.page(), spatial: undefined, layers: [] }, new Set(), true)
      .filter((row) => row.kind === "scene")
      .map((row) => row.owner.kind),
  ).toEqual(["camera", "environment"]);
});
