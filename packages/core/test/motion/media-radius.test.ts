import { expect, it } from "vitest";
import {
  createProject,
  createPage,
  createLayer,
  EditorEngine,
  compileMotion,
  evaluateMotion,
  applyMotionFrame,
  serializeProject,
  parseProject,
} from "../../src/index";
import { image, video } from "../assets/fixtures";
it.each(["image", "video"] as const)(
  "edits, animates and persists %s corner radii with atomic history",
  (kind) => {
    const asset = kind === "image" ? image() : video();
    const engine = new EditorEngine(
      createProject({
        assets: { [asset.id]: asset },
        pages: [createPage({ layers: [createLayer(kind, { id: "media", assetId: asset.id })] })],
      }),
    );
    const before = engine.getSnapshot().project;
    engine.execute({ type: "updateLayers", ids: ["media"], patch: { radius: 24 } });
    const rounded = engine.getSnapshot().project;
    engine.undo();
    expect(engine.getSnapshot().project).toEqual(before);
    engine.redo();
    expect(engine.getSnapshot().project).toEqual(rounded);
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    for (const [time, value] of [
      [0, 0],
      [1, 24],
    ])
      engine.execute({
        type: "upsertMotionKeyframe",
        target: { kind: "layer", layerId: "media", property: "radius" },
        time: { value: time!, rate: 1 },
        value: value!,
      });
    const project = parseProject(serializeProject(engine.getSnapshot().project));
    const program = compileMotion(project, { compositionId: project.pages[0]!.id });
    expect(
      applyMotionFrame(program, evaluateMotion(program, { value: 1, rate: 2 })).layers[0]!.radius,
    ).toBe(12);
    expect(project.pages[0]!.motion!.tracks[0]!.properties[0]!.keyframes).toHaveLength(2);
    const current = engine.getSnapshot().project;
    expect(() =>
      engine.execute({ type: "updateLayers", ids: ["media"], patch: { radius: -1 } }),
    ).toThrow();
    expect(engine.getSnapshot().project).toBe(current);
  },
);
