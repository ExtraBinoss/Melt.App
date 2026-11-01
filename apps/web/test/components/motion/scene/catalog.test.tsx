import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { createPage, createSpatialScene, SCENE_MOTION_ANIMATION_PRESETS } from "@musart/core";
import { PresetPicker } from "../../../../src/components/motion/animations/PresetPicker";
import { projectSceneTimelineRows } from "../../../../src/components/motion/scene/tree";
import { SceneTimelineRowView } from "../../../../src/components/motion/scene/SceneTimelineRowView";
import { AnimationContextMenu } from "../../../../src/components/motion/animations/AnimationContextMenu";
import { SpatialLightEditor } from "../../../../src/components/spatial/SpatialLightEditor";
import { SpatialSceneProperties } from "../../../../src/components/spatial/SpatialSceneProperties";
import { animationPresentation } from "../../../../src/components/motion/animations/presentation";
import { createTimelineGestures } from "../../../../src/components/motion/gestures";
import { makeTransport } from "../support";
import { setup } from "../../../support/ui";
it("keeps compatible scene categories visible while another category/search is selected", () => {
  const d = setup();
  d.engine.execute({ type: "updatePage", patch: { spatial: createSpatialScene() } });
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const page = d.engine.getSnapshot().project.pages[0]!;
  d.mount(
    <PresetPicker
      engine={d.engine}
      scene={{ page, owner: { kind: "camera", compositionId: page.id } }}
      apply={() => {}}
    />,
  );
  const categories = document.querySelector(".animation-categories")!;
  const rotate = [...categories.querySelectorAll("button")].find(
    (button) => button.textContent === "Rotation",
  )!;
  const move = [...categories.querySelectorAll("button")].find(
    (button) => button.textContent === "Déplacement",
  )!;
  expect(rotate).toBeTruthy();
  expect(move).toBeTruthy();
  fireEvent.click(rotate);
  expect(move.isConnected).toBe(true);
  fireEvent.change(screen.getByRole("searchbox", { name: "Rechercher une animation…" }), {
    target: { value: "no matching recipe" },
  });
  expect(categories.contains(rotate)).toBe(true);
  expect(categories.contains(move)).toBe(true);
});

it("distinguishes authored and action camera properties and names projection precisely", () => {
  const d = setup();
  d.engine.execute({ type: "updatePage", patch: { spatial: createSpatialScene() } });
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const pageId = d.engine.getSnapshot().pageId;
  for (const [property, value] of [
    ["yaw", 25],
    ["projection", "perspective"],
  ] as const)
    d.engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "camera", compositionId: pageId, property },
      time: { value: 0, rate: 1 },
      value,
    });
  d.engine.execute({
    type: "addMotionAnimation",
    owner: { kind: "camera", compositionId: pageId },
    preset: SCENE_MOTION_ANIMATION_PRESETS.find((preset) => preset.id === "scene-camera-orbit")!,
    start: { value: 0, rate: 1 },
  });
  const lightId = d.engine.getSnapshot().project.pages[0]!.spatial!.lights[0]!.id;
  d.engine.execute({
    type: "upsertMotionKeyframe",
    target: { kind: "light", compositionId: pageId, lightId, property: "type" },
    time: { value: 0, rate: 1 },
    value: "directional",
  });
  const page = d.engine.getSnapshot().project.pages[0]!;
  const rows = projectSceneTimelineRows(page, new Set(), true).filter(
    (row) => row.kind === "sceneProperty",
  );
  const runtime = makeTransport(page);
  const gestures = createTimelineGestures({
    engine: d.engine,
    transport: runtime.transport,
    compositionId: pageId,
    onSelection: () => {},
    onError: () => {},
  });
  d.mount(
    <>
      {rows.map((row, index) => (
        <SceneTimelineRowView
          key={row.key}
          row={row}
          top={index * 24}
          height={24}
          engine={d.engine}
          page={page}
          transport={runtime.transport}
          gestures={gestures}
          interactive
          onToggle={() => {}}
          scale={100}
        />
      ))}
    </>,
  );
  expect(screen.getByTitle("Azimut")).toBeTruthy();
  expect(screen.getByTitle("Orbite caméra · Azimut")).toBeTruthy();
  expect(screen.getByTitle("Projection")).toBeTruthy();
  expect(screen.getByTitle("Type de lumière")).toBeTruthy();
  d.mount(
    <SpatialLightEditor
      engine={d.engine}
      compositionId={pageId}
      light={page.spatial!.lights[0]!}
      onPreview={() => {}}
      onCommit={() => {}}
      onCancel={() => {}}
    />,
  );
  expect(screen.getByRole("combobox", { name: "Type de lumière" })).toHaveTextContent(
    "Directionnelle",
  );
  gestures.dispose();
});

it("reveals existing owner editors only on explicit activation and preserves manual dismissal", () => {
  const d = setup();
  const scene = createSpatialScene();
  d.engine.execute({ type: "updatePage", patch: { spatial: scene } });
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const pageId = d.engine.getSnapshot().pageId;
  for (const kind of ["camera", "light"] as const) {
    const owner =
      kind === "camera"
        ? { kind, compositionId: pageId }
        : { kind, compositionId: pageId, lightId: scene.lights[0]!.id };
    d.engine.execute({
      type: "addMotionAnimation",
      owner,
      preset: SCENE_MOTION_ANIMATION_PRESETS.find(
        (preset) => preset.id === (kind === "camera" ? "scene-camera-orbit" : "scene-light-pulse"),
      )!,
      start: { value: 0, rate: 1 },
    });
  }
  const page = d.engine.getSnapshot().project.pages[0]!;
  const [camera, light] = page.motion!.sceneAnimations!;
  d.mount(<SpatialSceneProperties engine={d.engine} page={page} run={(task) => task()} />);
  const store = animationPresentation(d.engine);
  act(() => store.set({ selected: camera!.id }));
  const trigger = screen.getByRole("button", { name: "Caméra" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  act(() => store.requestEditor(camera!.id));
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(
    document.querySelector('[data-scene-animations="camera"] .animation-detail-channel'),
  ).toBeTruthy();
  fireEvent.click(trigger);
  act(() => store.set({ selected: camera!.id }));
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  act(() => store.requestEditor(camera!.id));
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  act(() => store.set({ selected: light!.id }));
  expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
  act(() => store.requestEditor(light!.id));
  expect(
    document.querySelector('[data-scene-animations="light"] .animation-detail-channel'),
  ).toBeTruthy();
});

it("drops pending editor activation after project replacement or page switching with reusable portable IDs", () => {
  const d = setup();
  d.engine.execute({ type: "updatePage", patch: { spatial: createSpatialScene() } });
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const compositionId = d.engine.getSnapshot().pageId;
  d.engine.execute({
    type: "addMotionAnimation",
    owner: { kind: "camera", compositionId },
    preset: SCENE_MOTION_ANIMATION_PRESETS[0]!,
    start: { value: 0, rate: 1 },
  });
  const project = structuredClone(d.engine.getSnapshot().project);
  const animationId = project.pages[0]!.motion!.sceneAnimations![0]!.id;
  const store = animationPresentation(d.engine);
  store.requestEditor(animationId);
  d.engine.load(project);
  expect(store.takeEditorRequest()).toBeNull();
  project.pages.push(createPage({ id: "different-page" }));
  d.engine.load(project);
  store.requestEditor(animationId);
  d.engine.setPage("different-page");
  expect(store.takeEditorRequest()).toBeNull();
  d.engine.setPage(compositionId);
  store.requestEditor(animationId);
  expect(store.takeEditorRequest()).toBe(animationId);
  expect(store.takeEditorRequest()).toBeNull();
});

it("hands an actual scene context menu to the light editor after close focus without immediately dismissing it", async () => {
  const d = setup();
  const scene = createSpatialScene();
  d.engine.execute({ type: "updatePage", patch: { spatial: scene } });
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const compositionId = d.engine.getSnapshot().pageId;
  d.engine.execute({
    type: "addMotionAnimation",
    owner: { kind: "light", compositionId, lightId: scene.lights[0]!.id },
    preset: SCENE_MOTION_ANIMATION_PRESETS.find((preset) => preset.id === "scene-light-pulse")!,
    start: { value: 0, rate: 1 },
  });
  const page = d.engine.getSnapshot().project.pages[0]!,
    animation = page.motion!.sceneAnimations![0]!;
  d.mount(
    <>
      <SpatialSceneProperties engine={d.engine} page={page} run={(task) => task()} />
      <AnimationContextMenu
        engine={d.engine}
        page={page}
        animation={animation}
        transport={makeTransport(page).transport}
        disabled={false}
      >
        <button>Scene action</button>
      </AnimationContextMenu>
    </>,
  );
  const trigger = screen.getByRole("button", { name: "Scene action" });
  trigger.focus();
  fireEvent.contextMenu(trigger);
  fireEvent.click(await screen.findByRole("menuitem", { name: "Modifier l’animation" }));
  await waitFor(() =>
    expect(
      document.querySelector(
        '[data-slot="popover-content"] [data-scene-animations="light"] .animation-detail-channel',
      ),
    ).toBeVisible(),
  );
  expect(screen.queryByRole("menuitem", { name: "Modifier l’animation" })).toBeNull();
  expect(screen.getByRole("combobox", { name: "Type de lumière" })).toHaveTextContent(
    "Directionnelle",
  );
  expect(document.activeElement).not.toBe(trigger);
});
