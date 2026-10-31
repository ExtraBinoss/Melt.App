import { describe, expect, it } from "vitest";
import {
  applyMotionFrame,
  compileMotion,
  copyContent,
  createEffect,
  createLayer,
  createPage,
  createProject,
  createSpatialScene,
  EditorEngine,
  evaluateMotion,
  parseClipboard,
  parseProject,
  pasteContent,
  resolveMotionProperty,
  resolveSceneMotionProperty,
  serializeProject,
  createMotionKeyframePreview,
  type SceneMotionPropertyTarget,
} from "../../../src/index";
const time = (value: number) => ({ value, rate: 1 });
function fixture(spatial = true) {
  const scene = createSpatialScene();
  scene.lights[0]!.id = "durable-light";
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "page",
          layers: [createLayer("rectangle", { id: "shape" })],
          ...(spatial ? { spatial: scene } : {}),
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const page = () => engine.getSnapshot().project.pages[0]!;
  const key = (target: SceneMotionPropertyTarget, value: number | string | boolean, at: number) =>
    engine.execute({ type: "upsertMotionKeyframe", target, value, time: time(at) });
  return { engine, page, key };
}
const camera = { kind: "camera", compositionId: "page", property: "yaw" } as const;
const environment = { kind: "environment", compositionId: "page", property: "intensity" } as const;
const light = {
  kind: "light",
  compositionId: "page",
  lightId: "durable-light",
  property: "x",
} as const;
describe("durable composition Motion", () => {
  it("samples camera, environment and light alongside legacy layer keys, serializes and undoes one batch", () => {
    const d = fixture();
    for (const [target, a, b] of [
      [camera, 0, 90],
      [environment, 1, 3],
      [light, -2, 2],
    ] as const) {
      d.key(target, a, 0);
      d.key(target, b, 2);
    }
    d.engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: "shape", property: "x" },
      time: time(0),
      value: 12,
    });
    const canonical = d.page();
    const project = parseProject(serializeProject(d.engine.getSnapshot().project));
    const program = compileMotion(project, { compositionId: "page" });
    const frame = applyMotionFrame(program, evaluateMotion(program, time(1)));
    expect(frame.spatial!.camera.yaw).toBe(45);
    expect(frame.spatial!.environment.intensity).toBe(2);
    expect(frame.spatial!.lights[0]!.x).toBe(0);
    expect(frame.layers[0]!.x).toBe(12);
    expect(d.page()).toBe(canonical);
    expect(d.page().motion!.tracks).toHaveLength(1);
    const ids = d
      .page()
      .motion!.sceneProperties!.flatMap((property) => property.keyframes.map((key) => key.id));
    d.engine.execute({ type: "moveMotionKeyframes", keyframeIds: ids, delta: time(1) });
    expect(d.page().motion!.sceneProperties![0]!.keyframes.map((key) => key.time.value)).toEqual([
      1, 3,
    ]);
    d.engine.undo();
    expect(d.page().motion!.sceneProperties![0]!.keyframes[0]!.time.value).toBe(0);
    d.engine.redo();
    expect(d.page().motion!.sceneProperties![0]!.keyframes[0]!.time.value).toBe(1);
    d.engine.execute({ type: "deleteMotionKeyframes", keyframeIds: ids });
    expect(
      d.page().motion!.sceneProperties!.every((property) => property.keyframes.length === 0),
    ).toBe(true);
  });
  it("rejects wrong owners, missing durable lights, invalid values and object paths atomically", () => {
    const d = fixture(),
      before = d.engine.getSnapshot();
    for (const target of [
      { ...camera, compositionId: "other" },
      { ...light, lightId: "missing" },
      { ...camera, property: "camera.yaw" },
    ])
      expect(() => d.key(target as SceneMotionPropertyTarget, 1, 0)).toThrow();
    expect(() => d.key(environment, 11, 0)).toThrow();
    expect(d.engine.getSnapshot()).toBe(before);
    expect(
      resolveSceneMotionProperty(d.page(), {
        ...camera,
        property: "__proto__",
      } as unknown as SceneMotionPropertyTarget),
    ).toBeNull();
  });
  it("supports legacy scenes without spatial data, keeping sampled identities deterministic", () => {
    const d = fixture(false);
    expect(resolveSceneMotionProperty(d.page(), camera)?.value).toBe(25);
    expect(resolveSceneMotionProperty(d.page(), light)).toBeNull();
    d.key(camera, 0, 0);
    d.key(camera, 90, 2);
    const program = compileMotion(d.engine.getSnapshot().project, { compositionId: "page" });
    const frame = () => applyMotionFrame(program, evaluateMotion(program, time(1)));
    expect(frame().spatial).toEqual(frame().spatial);
    expect(d.page().spatial!.camera.yaw).toBe(25);
  });
  it("prunes deleted/rig-replaced light channels in the same undo transaction", () => {
    const d = fixture();
    d.key(light, 1, 0);
    d.key(camera, 30, 0);
    const before = d.page();
    d.engine.execute({
      type: "updatePage",
      patch: { spatial: { ...before.spatial!, lights: [] } },
    });
    expect(d.page().motion!.sceneProperties!.map(({ target }) => target.kind)).toEqual(["camera"]);
    d.engine.undo();
    expect(d.page().motion!.sceneProperties).toEqual(before.motion!.sceneProperties);
    const rig = createSpatialScene();
    d.engine.execute({
      type: "updatePage",
      patch: { spatial: { ...d.page().spatial!, lights: rig.lights } },
    });
    expect(d.page().motion!.sceneProperties!.map(({ target }) => target.kind)).toEqual(["camera"]);
  });
  it("remaps composition/light/channel/key identities during composition clipboard duplication", () => {
    const d = fixture();
    d.key(camera, 10, 0);
    d.key(light, 4, 0);
    const content = parseClipboard(
      copyContent(d.engine.getSnapshot(), { composition: true }),
      d.engine.getSnapshot().project,
    );
    let sequence = 0;
    const plan = pasteContent(
      content,
      d.engine.getSnapshot().project,
      { x: 0, y: 0 },
      () => `copy-${++sequence}`,
    );
    d.engine.transaction(plan.commands);
    const copy = d.engine.getSnapshot().project.pages[1]!;
    expect(copy.id).not.toBe("page");
    expect(copy.spatial!.lights[0]!.id).not.toBe("durable-light");
    for (const property of copy.motion!.sceneProperties!) {
      expect(property.target.compositionId).toBe(copy.id);
      expect(resolveSceneMotionProperty(copy, property.target)).not.toBeNull();
      expect(
        d
          .page()
          .motion!.sceneProperties!.some(
            (old) => old.id === property.id || old.keyframes[0]!.id === property.keyframes[0]!.id,
          ),
      ).toBe(false);
    }
    expect(parseProject(serializeProject(d.engine.getSnapshot().project))).toEqual(
      d.engine.getSnapshot().project,
    );
  });
  it("previews scene key movement without publishing document keys and rejects collisions", () => {
    const d = fixture();
    d.key(camera, 0, 0);
    d.key(camera, 90, 2);
    const program = compileMotion(d.engine.getSnapshot().project, { compositionId: "page" });
    const id = d.page().motion!.sceneProperties![0]!.keyframes[0]!.id;
    const preview = createMotionKeyframePreview(program, [id]);
    expect(preview.accepts(time(2))).toBe(false);
    const sampled = preview.sample(time(1));
    expect(applyMotionFrame(sampled, evaluateMotion(sampled, time(1))).spatial!.camera.yaw).toBe(0);
    expect(d.page().motion!.sceneProperties![0]!.keyframes[0]!.time.value).toBe(0);
  });
  it("samples native RGB light colors at intermediate times and rejects alpha commands/imports", () => {
    const d = fixture();
    const color = { ...light, property: "color" } as const;
    d.key(color, "#ff0000", 0);
    d.key(color, "#0000ff", 2);
    const program = compileMotion(d.engine.getSnapshot().project, { compositionId: "page" });
    expect(
      applyMotionFrame(program, evaluateMotion(program, time(1))).spatial!.lights[0]!.color,
    ).toBe("#800080");
    for (const value of ["#ff000080", "#f008", "transparent"]) {
      const before = d.engine.getSnapshot();
      expect(() => d.key(color, value, 1)).toThrow();
      expect(d.engine.getSnapshot()).toBe(before);
      const project = structuredClone(before.project);
      project.pages[0]!.motion!.sceneProperties![0]!.keyframes[0]!.value = value;
      expect(() => compileMotion(project, { compositionId: "page" })).toThrow();
    }
    const legacy = structuredClone(d.engine.getSnapshot().project);
    legacy.pages[0]!.spatial!.lights[0]!.color = "#f00";
    expect(resolveSceneMotionProperty(legacy.pages[0]!, color)?.value).toBe("#ff0000");
    expect(compileMotion(legacy, { compositionId: "page" })).toBeDefined();
    legacy.pages[0]!.motion!.sceneProperties = [];
    legacy.pages[0]!.spatial!.lights[0]!.color = "#ff000080";
    expect(parseProject(serializeProject(legacy)).pages[0]!.spatial!.lights[0]!.color).toBe(
      "#ff000080",
    );
    expect(compileMotion(legacy, { compositionId: "page" })).toBeDefined();
  });
  it("validates imported scene addresses, values, key ordering and globally unique identities", () => {
    const d = fixture();
    d.key(camera, 0, 0);
    d.key(camera, 90, 2);
    for (const corrupt of [
      (p: ReturnType<typeof d.page>) => {
        p.motion!.sceneProperties![0]!.target = { ...camera, compositionId: "missing" };
      },
      (p: ReturnType<typeof d.page>) => {
        p.motion!.sceneProperties![0]!.keyframes[1]!.time = time(0);
      },
      (p: ReturnType<typeof d.page>) => {
        p.motion!.sceneProperties![0]!.keyframes[0]!.id = "shape";
      },
      (p: ReturnType<typeof d.page>) => {
        p.motion!.sceneProperties![0]!.keyframes[0]!.value = Infinity;
      },
    ]) {
      const project = structuredClone(d.engine.getSnapshot().project);
      corrupt(project.pages[0]!);
      expect(() => compileMotion(project, { compositionId: "page" })).toThrow();
    }
  });
  it("publishes dependency capabilities for source, material, pose and effects", () => {
    const d = fixture();
    const shape = {
      ...d.page().layers[0]!,
      effects: [createEffect("blur", { id: "blur" }), createEffect("morph", { id: "morph" })],
    };
    const page = { ...d.page(), layers: [shape] };
    expect(
      resolveMotionProperty(page, { kind: "layer", layerId: "shape", property: "fill" })!
        .dependencies,
    ).toContain("appearance");
    expect(
      resolveMotionProperty(page, {
        kind: "effect",
        layerId: "shape",
        effectId: "blur",
        property: "amount",
      })!.dependencies,
    ).toEqual(["composite"]);
    expect(resolveSceneMotionProperty(page, light)!.dependencies).toContain("shadows");
  });
});
