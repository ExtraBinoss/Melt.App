import { collectProjectIds } from "../../../src/document/identity";
import { describe, expect, it } from "vitest";
import {
  animationPointId,
  applyMotionFrame,
  canApplySceneMotionAnimationPreset,
  captureSceneMotionAnimationPreset,
  compileMotion,
  copyContent,
  createLayer,
  createMotionKeyframePreview,
  createPage,
  createProject,
  createSpatialScene,
  EditorEngine,
  evaluateMotion,
  extractSceneMotionAnimationPreset,
  parseClipboard,
  parseProject,
  pasteContent,
  projectSceneAnimationProperties,
  projectSceneMotionAnimations,
  projectSceneMotionProperties,
  SCENE_MOTION_ANIMATION_PRESETS,
  sceneAnimationOwner,
  sceneAnimationOwnerKey,
  serializeProject,
  validateMotionAnimationPreset,
  validateSceneMotionAnimationPreset,
  type SceneAnimationOwner,
  type SceneMotionAnimationPreset,
} from "../../../src/index";
const t = (value: number, rate = 1) => ({ value, rate });
const camera = { kind: "camera", compositionId: "page" } as const;
const environment = { kind: "environment", compositionId: "page" } as const;
const light = { kind: "light", compositionId: "page", lightId: "lamp" } as const;
const recipe = (id: string) => SCENE_MOTION_ANIMATION_PRESETS.find((preset) => preset.id === id)!;
function fixture() {
  const spatial = createSpatialScene();
  spatial.lights[0]!.id = "lamp";
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({ id: "page", spatial, layers: [createLayer("rectangle", { id: "shape" })] }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const page = () => engine.getSnapshot().project.pages[0]!;
  const add = (owner: SceneAnimationOwner = camera, preset = recipe("scene-camera-orbit")) =>
    engine.execute({ type: "addMotionAnimation", owner, preset, start: t(0) });
  const sample = (value: number, rate = 1) => {
    const program = compileMotion(engine.getSnapshot().project, { compositionId: "page" });
    return applyMotionFrame(program, evaluateMotion(program, t(value, rate)));
  };
  return { engine, page, add, sample };
}
describe("reusable scene Motion actions", () => {
  it("validates/filter presets against genuine camera/environment/durable light owners", () => {
    const d = fixture();
    for (const preset of SCENE_MOTION_ANIMATION_PRESETS) {
      expect(() => validateSceneMotionAnimationPreset(preset)).not.toThrow();
      expect(() => validateMotionAnimationPreset(preset)).toThrow();
    }
    expect(
      SCENE_MOTION_ANIMATION_PRESETS.filter((preset) =>
        canApplySceneMotionAnimationPreset(d.page(), camera, preset),
      ),
    ).toHaveLength(2);
    expect(
      SCENE_MOTION_ANIMATION_PRESETS.filter((preset) =>
        canApplySceneMotionAnimationPreset(d.page(), light, preset),
      ),
    ).toHaveLength(1);
    expect(
      canApplySceneMotionAnimationPreset(
        d.page(),
        { ...light, lightId: "missing" },
        recipe("scene-light-pulse"),
      ),
    ).toBe(false);
    expect(sceneAnimationOwner({ ...light, property: "intensity" })).toEqual(light);
    expect(sceneAnimationOwnerKey(light)).not.toBe(
      sceneAnimationOwnerKey({ ...light, lightId: "other" }),
    );
  });
  it("keeps sparse authoritative camera points and samples the same interpolated native scene for preview/export", () => {
    const d = fixture(),
      original = d.page();
    d.add();
    const animation = d.page().motion!.sceneAnimations![0]!;
    expect(animation.preset.channels[0]!.points.map(({ value }) => value)).toEqual([5, -5, 5]);
    expect(animation.preset.channels[0]!.points).toHaveLength(3);
    expect(d.page().motion!.sceneProperties).toBeUndefined();
    expect(d.page().motion!.tracks.every((track) => !track.animations?.length)).toBe(true);
    expect(d.sample(0).spatial!.camera.yaw).toBe(5);
    expect(d.sample(4).spatial!.camera.yaw).toBe(-5);
    expect(d.sample(8).spatial!.camera.yaw).toBe(5);
    expect(d.sample(1).spatial!.camera.yaw).toBeGreaterThan(0);
    expect(d.sample(1).spatial!.camera.yaw).toBeLessThan(5);
    expect(d.page().layers).toEqual(original.layers);
    expect(d.page().spatial!.camera.yaw).toBe(25);
    expect(projectSceneMotionAnimations(d.page(), camera)).toEqual([animation]);
    const projected = projectSceneAnimationProperties(d.page(), camera)[0]!;
    expect(projected.property.target).toEqual({ ...camera, property: "yaw" });
    expect(projected.property.keyframes.map(({ time }) => time)).toEqual([t(0), t(4), t(8)]);
    expect(projectSceneMotionProperties(d.page(), camera)).toEqual([projected.property]);
    expect(collectProjectIds(d.engine.getSnapshot().project).has(animation.id)).toBe(true);
    expect(parseProject(serializeProject(d.engine.getSnapshot().project))).toEqual(
      d.engine.getSnapshot().project,
    );
  });
  it("shares ordered add/multiply/replace composition after ordinary scene keys and preserves legacy layer actions", () => {
    const d = fixture();
    d.engine.execute({
      type: "upsertMotionKeyframe",
      target: { ...environment, property: "rotation" },
      time: t(0),
      value: 10,
    });
    d.add(environment, recipe("scene-environment-turn"));
    d.add(light, recipe("scene-light-pulse"));
    expect(d.sample(4).spatial!.environment.rotation).toBe(190);
    expect(d.sample(1).spatial!.lights[0]!.intensity).toBeCloseTo(5.4);
    const color: SceneMotionAnimationPreset = {
      version: 1,
      id: "colors",
      name: "Lamp colors",
      category: "custom",
      duration: 2000,
      effects: [],
      channels: [
        {
          target: { kind: "light", property: "color" },
          operation: "replace",
          points: [
            { at: 0, value: "#ff0000" },
            { at: 1, value: "#0000ff" },
          ],
        },
      ],
    };
    d.add(light, color);
    expect(d.sample(1).spatial!.lights[0]!.color).toBe("#800080");
    const trackId = d.page().motion!.tracks[0]!.id;
    d.engine.execute({
      type: "addMotionAnimation",
      trackId,
      preset: {
        version: 1,
        id: "move",
        name: "Move",
        category: "move",
        duration: 2000,
        effects: [],
        channels: [
          {
            target: { kind: "layer", property: "x" },
            operation: "add",
            points: [
              { at: 0, value: 0 },
              { at: 1, value: 20 },
            ],
          },
        ],
      },
      start: t(0),
    });
    expect(d.sample(1).layers[0]!.x).toBe(d.page().layers[0]!.x + 10);
  });
  it("applies enabled actions in order with strength and property clamps after ordinary keys", () => {
    const d = fixture();
    d.engine.execute({
      type: "upsertMotionKeyframe",
      target: { ...light, property: "intensity" },
      time: t(0),
      value: 90,
    });
    d.add(light, recipe("scene-light-pulse"));
    const first = d.page().motion!.sceneAnimations![0]!;
    d.engine.execute({
      type: "updateMotionAnimation",
      animationId: first.id,
      patch: { strength: 10 },
    });
    expect(d.sample(1).spatial!.lights[0]!.intensity).toBe(100);
    const replace: SceneMotionAnimationPreset = {
      version: 1,
      id: "dim",
      name: "Dim",
      category: "custom",
      duration: 2000,
      effects: [],
      channels: [
        {
          target: { kind: "light", property: "intensity" },
          operation: "replace",
          points: [
            { at: 0, value: 10 },
            { at: 1, value: 10 },
          ],
        },
      ],
    };
    d.add(light, replace);
    const second = d.page().motion!.sceneAnimations![1]!;
    d.engine.execute({
      type: "updateMotionAnimation",
      animationId: second.id,
      patch: { strength: 0.5 },
    });
    expect(d.sample(1).spatial!.lights[0]!.intensity).toBe(55);
    d.engine.execute({
      type: "updateMotionAnimation",
      animationId: second.id,
      patch: { enabled: false },
    });
    expect(d.sample(1).spatial!.lights[0]!.intensity).toBe(100);
    d.engine.execute({
      type: "updateMotionAnimation",
      animationId: first.id,
      patch: { enabled: false },
    });
    expect(d.sample(1).spatial!.lights[0]!.intensity).toBe(90);
    d.engine.execute({ type: "setCompositionMode", mode: "static" });
    expect(d.sample(1).spatial!.lights[0]!.intensity).toBe(3);
  });
  it("moves/trims derived points, edits easing in-place, previews/cancels, and commits one undoable batch", () => {
    const d = fixture();
    d.add();
    const animation = d.page().motion!.sceneAnimations![0]!,
      middle = animationPointId(animation.id, 0, 1);
    const program = compileMotion(d.engine.getSnapshot().project, { compositionId: "page" });
    const preview = createMotionKeyframePreview(program, [middle]);
    expect(preview.accepts(t(4))).toBe(false);
    const draft = preview.sample(t(1));
    expect(projectSceneMotionProperties(draft.composition, camera)[0]!.keyframes[1]!.time).toEqual(
      t(5),
    );
    expect(d.page().motion!.sceneAnimations![0]!.preset.channels[0]!.points[1]!.at).toBe(0.5);
    const before = d.engine.getSnapshot().project;
    d.engine.execute({ type: "moveMotionKeyframe", keyframeId: middle, time: t(5) });
    expect(d.page().motion!.sceneAnimations![0]!.preset.channels[0]!.points[1]!.at).toBe(0.625);
    d.engine.undo();
    expect(d.engine.getSnapshot().project).toBe(before);
    d.engine.redo();
    const current = d.page().motion!.sceneAnimations![0]!;
    const preset = structuredClone(current.preset);
    preset.channels[0]!.points[1]!.easing = { type: "hold" };
    d.engine.execute({ type: "updateMotionAnimation", animationId: current.id, patch: { preset } });
    expect(projectSceneMotionProperties(d.page(), camera)[0]!.keyframes[1]!.easing).toEqual({
      type: "hold",
    });
    expect(d.sample(4).spatial!.camera.yaw).toBe(5);
    d.engine.execute({
      type: "moveMotionKeyframes",
      keyframeIds: [animationPointId(current.id, 0, 0)],
      delta: t(1),
    });
    expect(d.page().motion!.sceneAnimations![0]!.start).toEqual(t(1));
    expect(projectSceneMotionProperties(d.page(), camera)[0]!.keyframes[1]!.time).toEqual(t(5));
    d.engine.execute({ type: "deleteMotionKeyframe", keyframeId: middle });
    expect(d.page().motion!.sceneAnimations![0]!.preset.channels[0]!.points).toHaveLength(2);
    const stable = d.engine.getSnapshot();
    expect(() =>
      d.engine.execute({
        type: "deleteMotionKeyframe",
        keyframeId: animationPointId(current.id, 0, 0),
      }),
    ).toThrow("endpoints");
    expect(d.engine.getSnapshot()).toBe(stable);
    d.engine.execute({ type: "deleteMotionAnimation", animationId: current.id });
    expect(d.page().motion!.sceneAnimations).toEqual([]);
  });
  it("captures independent library recipes and extracts canonical key intervals without durable source IDs", () => {
    const d = fixture();
    d.add();
    const animation = d.page().motion!.sceneAnimations![0]!;
    d.engine.execute({
      type: "updateMotionAnimation",
      animationId: animation.id,
      patch: { strength: 0.5, duration: t(10) },
    });
    const current = d.page().motion!.sceneAnimations![0]!;
    const captured = captureSceneMotionAnimationPreset(
      d.page(),
      current,
      "Saved orbit",
      "saved-orbit",
    );
    expect(captured.duration).toBe(10000);
    expect(captured.channels[0]!.points.map(({ value }) => value)).toEqual([15, 10, 15]);
    expect(
      captureSceneMotionAnimationPreset(d.page(), current, "Raw", "raw", { bakeStrength: false })
        .channels[0]!.points[0]!.value,
    ).toBe(5);
    captured.channels[0]!.points[0]!.value = 90;
    expect(current.preset.channels[0]!.points[0]!.value).toBe(5);
    d.engine.transaction(
      [0, 2].map((value) => ({
        type: "upsertMotionKeyframe",
        target: { ...camera, property: "pitch" },
        time: t(value),
        value: value * 20,
      })),
    );
    const extracted = extractSceneMotionAnimationPreset(d.page(), camera, "Pitch", "pitch");
    expect(extracted.channels[0]!.target).toEqual({ kind: "camera", property: "pitch" });
    expect(extracted.channels[0]!.points.map(({ value }) => value)).toEqual([0, 40]);
    expect(JSON.stringify(extracted)).not.toContain("compositionId");
    expect(JSON.stringify(extracted)).not.toContain("lightId");
  });
  it("remaps composition/light/action identities on clipboard duplication and prunes deleted-light actions atomically", () => {
    const d = fixture();
    d.add();
    d.add(light, recipe("scene-light-pulse"));
    let sequence = 0;
    const project = d.engine.getSnapshot().project,
      content = parseClipboard(copyContent(d.engine.getSnapshot(), { composition: true }), project);
    const copied = pasteContent(content, project, { x: 0, y: 0 }, () => `copy-${++sequence}`);
    d.engine.transaction(copied.commands);
    const copy = d.engine.getSnapshot().project.pages[1]!;
    expect(
      copy.motion!.sceneAnimations!.every((animation) => animation.owner.compositionId === copy.id),
    ).toBe(true);
    const copiedLight = copy.motion!.sceneAnimations!.find(
      (animation) => animation.owner.kind === "light",
    )!;
    expect(copiedLight.owner).toEqual({
      kind: "light",
      compositionId: copy.id,
      lightId: copy.spatial!.lights[0]!.id,
    });
    expect(
      copy.motion!.sceneAnimations!.some((animation) =>
        project.pages[0]!.motion!.sceneAnimations!.some((original) => original.id === animation.id),
      ),
    ).toBe(false);
    d.engine.setPage("page");
    const before = d.engine.getSnapshot().project;
    d.engine.execute({
      type: "updatePage",
      patch: { spatial: { ...d.page().spatial!, lights: [] } },
    });
    expect(d.page().motion!.sceneAnimations!.map((animation) => animation.owner.kind)).toEqual([
      "camera",
    ]);
    d.engine.undo();
    expect(d.engine.getSnapshot().project).toBe(before);
  });
  it("rejects malformed owners, targets, units, alpha colors and invalid updates atomically", () => {
    const d = fixture();
    const before = d.engine.getSnapshot();
    expect(() => d.add(light, recipe("scene-camera-orbit"))).toThrow();
    expect(d.engine.getSnapshot()).toBe(before);
    for (const corrupt of [
      (preset: SceneMotionAnimationPreset) => {
        Object.assign(preset.channels[0]!.target, { compositionId: "injected" });
      },
      (preset: SceneMotionAnimationPreset) => {
        preset.channels[0]!.unit = "width";
      },
      (preset: SceneMotionAnimationPreset) => {
        preset.channels[0]!.points[1]!.at = 0;
      },
    ]) {
      const preset = structuredClone(recipe("scene-camera-orbit"));
      corrupt(preset);
      expect(() => validateSceneMotionAnimationPreset(preset)).toThrow();
    }
    const alpha: SceneMotionAnimationPreset = {
      version: 1,
      id: "alpha",
      name: "Invalid alpha light",
      category: "custom",
      duration: 2000,
      effects: [],
      channels: [
        {
          target: { kind: "light", property: "color" },
          operation: "replace",
          points: [
            { at: 0, value: "#ff000080" },
            { at: 1, value: "#0000ff" },
          ],
        },
      ],
    };
    expect(() => validateSceneMotionAnimationPreset(alpha)).toThrow();
    d.add();
    const animation = d.page().motion!.sceneAnimations![0]!,
      stable = d.engine.getSnapshot();
    expect(() =>
      d.engine.execute({
        type: "updateMotionAnimation",
        animationId: animation.id,
        patch: { duration: t(-1) },
      }),
    ).toThrow();
    expect(d.engine.getSnapshot()).toBe(stable);
    const imported = structuredClone(stable.project);
    imported.pages[0]!.motion!.sceneAnimations![0]!.owner = { ...camera, compositionId: "missing" };
    expect(() => compileMotion(imported, { compositionId: "page" })).toThrow();
  });
});
