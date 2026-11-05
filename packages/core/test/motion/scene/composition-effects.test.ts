import { describe, expect, it } from "vitest";
import {
  applyMotionFrame,
  canApplySceneMotionAnimationPreset,
  compileMotion,
  copyContent,
  createEffect,
  createPage,
  createProject,
  EditorEngine,
  evaluateMotion,
  listSceneMotionProperties,
  parseClipboard,
  parseProject,
  pasteContent,
  projectSceneMotionProperties,
  serializeProject,
  validateSceneMotionAnimationPreset,
  type SceneMotionAnimationPreset,
} from "../../../src/index";

const owner = { kind: "compositionEffect", compositionId: "page", effectId: "effect" } as const;
const amount = { ...owner, property: "amount" } as const;
const color = { ...owner, kind: "compositionEffectSetting", property: "color0" } as const;
const t = (value: number, rate = 1) => ({ value, rate });
function fixture() {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "page",
          effects: [createEffect("gradient", { id: "effect" })],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const page = () => engine.getSnapshot().project.pages[0]!;
  const sample = (time: number) => {
    const program = compileMotion(engine.getSnapshot().project, { compositionId: "page" });
    return applyMotionFrame(program, evaluateMotion(program, t(time)));
  };
  return { engine, page, sample };
}
function preset(): SceneMotionAnimationPreset {
  return {
    version: 1,
    id: "effect-pulse",
    name: "Effect pulse",
    category: "custom",
    duration: 2000,
    effects: [],
    channels: [
      {
        target: { kind: "compositionEffect", property: "amount" },
        operation: "replace",
        points: [
          { at: 0, value: 0 },
          { at: 1, value: 1 },
        ],
      },
      {
        target: { kind: "compositionEffectSetting", property: "color0" },
        operation: "replace",
        points: [
          { at: 0, value: "#000000" },
          { at: 1, value: "#ffffff" },
        ],
      },
    ],
  };
}
function add(d: ReturnType<typeof fixture>) {
  d.engine.execute({ type: "addMotionAnimation", owner, preset: preset(), start: t(0) });
}

describe("composition effect Motion owners", () => {
  it("resolves and samples typed direct/root/settings channels without creating a spatial scene", () => {
    const d = fixture();
    expect(
      listSceneMotionProperties(d.page()).some(
        ({ target }) =>
          target.kind === "compositionEffectSetting" &&
          target.effectId === owner.effectId &&
          target.property === "color0",
      ),
    ).toBe(true);
    d.engine.execute({ type: "upsertMotionKeyframe", target: amount, time: t(0), value: 0.2 });
    d.engine.execute({ type: "upsertMotionKeyframe", target: color, time: t(0), value: "#ff0000" });
    add(d);
    expect(d.page().spatial).toBeUndefined();
    expect(d.sample(1).effects![0]!.amount).toBeCloseTo(0.5);
    expect(d.sample(1).effects![0]!.settings!.color0).not.toBe("#ff0000");
    expect(d.page().effects![0]!.amount).not.toBe(0.5);
    expect(projectSceneMotionProperties(d.page(), owner)).toHaveLength(4);
    expect(parseProject(serializeProject(d.engine.getSnapshot().project)).pages[0]!.motion).toEqual(
      d.page().motion,
    );
  });

  it("rejects missing owners, unknown fields, foreign settings and invalid bound values atomically", () => {
    const d = fixture();
    expect(() => validateSceneMotionAnimationPreset(preset())).not.toThrow();
    expect(
      canApplySceneMotionAnimationPreset(d.page(), { ...owner, effectId: "missing" }, preset()),
    ).toBe(false);
    const invalid = preset();
    invalid.channels[1]!.target = { kind: "compositionEffectSetting", property: "octaves" };
    invalid.channels[1]!.points = [
      { at: 0, value: 1 },
      { at: 1, value: 2 },
    ];
    expect(canApplySceneMotionAnimationPreset(d.page(), owner, invalid)).toBe(false);
    const before = d.engine.getSnapshot().project;
    expect(() =>
      d.engine.execute({ type: "addMotionAnimation", owner, preset: invalid, start: t(0) }),
    ).toThrow();
    expect(d.engine.getSnapshot().project).toBe(before);
    const malformed = preset();
    Object.assign(malformed.channels[0]!.target, { effectId: "embedded" });
    expect(() => validateSceneMotionAnimationPreset(malformed)).toThrow();
  });

  it("remaps clipboard effect/action/property identities and prunes deleted effect dependents with undo", () => {
    const d = fixture();
    add(d);
    d.engine.execute({ type: "upsertMotionKeyframe", target: amount, time: t(0), value: 0.2 });
    const project = d.engine.getSnapshot().project;
    const content = parseClipboard(
      copyContent(d.engine.getSnapshot(), { composition: true }),
      project,
    );
    let sequence = 0;
    const copy = pasteContent(content, project, { x: 0, y: 0 }, () => `copy-${++sequence}`);
    d.engine.transaction(copy.commands);
    const copied = d.engine.getSnapshot().project.pages[1]!;
    expect(copied.motion!.sceneAnimations![0]!.owner).toEqual({
      kind: "compositionEffect",
      compositionId: copied.id,
      effectId: copied.effects![0]!.id,
    });
    expect(copied.motion!.sceneProperties![0]!.target).toEqual({
      kind: "compositionEffect",
      compositionId: copied.id,
      effectId: copied.effects![0]!.id,
      property: "amount",
    });
    expect(copied.motion!.sceneAnimations![0]!.id).not.toBe(
      d.page().motion!.sceneAnimations![0]!.id,
    );
    d.engine.setPage("page");
    const before = d.engine.getSnapshot().project;
    d.engine.execute({ type: "updatePage", patch: { effects: [] } });
    expect(d.page().motion!.sceneAnimations).toEqual([]);
    expect(d.page().motion!.sceneProperties).toEqual([]);
    d.engine.undo();
    expect(d.engine.getSnapshot().project).toBe(before);
    d.engine.redo();
    expect(d.page().motion!.sceneAnimations).toEqual([]);
  });
});
