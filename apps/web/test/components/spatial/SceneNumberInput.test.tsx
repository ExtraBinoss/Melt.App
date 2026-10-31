import "../../../src/state/i18n";
import { Profiler, useRef, useSyncExternalStore } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createPage, createProject, createSpatialScene, EditorEngine } from "@musart/core";
import { SceneNumberInput } from "../../../src/components/spatial/SceneNumberInput";
import {
  captureSceneMotionEdit,
  sceneMotionCommands,
  type SceneMotionEdit,
} from "../../../src/components/spatial/scene-motion-edit";
import { createMotionTransport } from "../../../src/services/motion/transport";
import { getMotionAuthoring } from "../../../src/state/session/motion-authoring";

it("restores the sampled scene value on Escape after Auto-key undo/redo without publishing drafts or React commits", () => {
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ id: "scene", spatial: createSpatialScene() })] }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const transport = createMotionTransport(engine);
  transport.seek({ value: 1, rate: 1 });
  getMotionAuthoring(engine).set(true);
  const target = { kind: "environment", compositionId: "scene", property: "intensity" } as const;
  const page = () => engine.getSnapshot().project.pages[0]!;
  const onRender = vi.fn(),
    preview = vi.fn(),
    cancel = vi.fn();
  function Host() {
    const current = useSyncExternalStore(engine.subscribe, page, page);
    const origin = useRef<SceneMotionEdit | null>(null);
    return (
      <SceneNumberInput
        engine={engine}
        target={target}
        identity={current}
        label="Environment intensity"
        value={current.spatial!.environment.intensity}
        min={0}
        max={10}
        onStart={() => {
          origin.current ??= captureSceneMotionEdit(engine, current);
        }}
        onPreview={preview}
        onCancel={() => {
          origin.current = null;
          cancel();
        }}
        onCommit={(value) => {
          const held = origin.current ?? captureSceneMotionEdit(engine, current);
          origin.current = null;
          engine.transaction(
            sceneMotionCommands(
              engine,
              held,
              {
                ...current.spatial!,
                environment: { ...current.spatial!.environment, intensity: value },
              },
              target,
            ),
          );
        }}
      />
    );
  }
  const view = render(
    <Profiler id="scene-inspector" onRender={onRender}>
      <Host />
    </Profiler>,
  );
  try {
    const field = screen.getByLabelText("Environment intensity");
    const initialRevision = engine.getSnapshot().revision;
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "2" } });
    expect(engine.getSnapshot().revision).toBe(initialRevision);
    fireEvent.keyDown(field, { key: "Enter" });
    expect(engine.getSnapshot().revision).toBe(initialRevision + 1);
    expect(page().spatial!.environment.intensity).toBe(1);
    expect(page().motion!.sceneProperties![0]!.keyframes[0]).toMatchObject({
      time: { value: 1, rate: 1 },
      value: 2,
    });
    expect(field).toHaveValue("2");
    act(() => engine.undo());
    expect(field).toHaveValue("1");
    act(() => engine.redo());
    expect(field).toHaveValue("2");
    const committedRevision = engine.getSnapshot().revision,
      commits = onRender.mock.calls.length;
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "4" } });
    expect(preview).toHaveBeenLastCalledWith(4);
    expect(field).toHaveValue("4");
    fireEvent.keyDown(field, { key: "Escape" });
    fireEvent.blur(field);
    expect(field).toHaveValue("2");
    expect(engine.getSnapshot().revision).toBe(committedRevision);
    expect(page().motion!.sceneProperties![0]!.keyframes[0]!.value).toBe(2);
    expect(cancel).toHaveBeenCalled();
    expect(onRender).toHaveBeenCalledTimes(commits);
  } finally {
    view.unmount();
    transport.dispose();
  }
});
