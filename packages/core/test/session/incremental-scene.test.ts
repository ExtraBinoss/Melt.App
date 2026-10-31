import { describe, expect, it } from "vitest";
import { createLayer, createPage, createProject } from "../../src/document/factories";
import { collectProjectIds, createId } from "../../src/document/identity";
import { cloneValue } from "../../src/document/immutable";
import { createSpatialScene } from "../../src/spatial/defaults";
import { EditorEngine } from "../../src/session/engine";
import type { Command, Project } from "../../src/document/model";

function sceneProject(): Project {
  const spatial = createSpatialScene();
  spatial.lights[0]!.id = "property-1";
  return createProject({
    pages: [
      createPage({
        id: "page",
        layers: [createLayer("rectangle", { id: "layer" })],
        spatial,
        motion: {
          version: 1,
          initialized: true,
          mode: "motion",
          duration: { value: 2, rate: 1 },
          frameRate: { numerator: 30, denominator: 1 },
          tracks: [
            {
              id: "track",
              layerId: "layer",
              start: { value: 0, rate: 1 },
              end: null,
              properties: [],
            },
          ],
          sceneProperties: [
            {
              id: "property-2",
              target: { kind: "camera", compositionId: "page", property: "yaw" },
              keyframes: [{ id: "key-4", time: { value: 0, rate: 1 }, value: 10 }],
            },
          ],
        },
      }),
    ],
  });
}

describe("scene identities in session transactions", () => {
  it("reserves lights, scene channels and their keys during engine allocations after scalar batches", () => {
    const engine = new EditorEngine(sceneProject());
    engine.transaction([
      { type: "renameProject", name: "Keep scene identity index" },
      { type: "updateLayers", ids: ["layer"], patch: { x: 5 } },
    ]);
    const before = engine.getSnapshot();
    engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: "layer", property: "x" },
      time: { value: 0, rate: 1 },
      value: 50,
    });
    const page = engine.getSnapshot().project.pages[0]!;
    const property = page.motion!.tracks[0]!.properties[0]!;
    expect(property.id).toBe("property-3");
    expect(property.keyframes[0]!.id).toBe("key-5");
    expect(collectProjectIds(engine.getSnapshot().project)).toEqual(
      new Set([...collectProjectIds(before.project), "property-3", "key-5"]),
    );
  });

  it("reserves imported scene IDs in the factory allocator as well as the engine", () => {
    for (const domain of ["light", "property", "key"] as const) {
      const project = sceneProject();
      const suffix = Number.parseInt(createId("checkpoint").split("-").at(-1)!, 36) + 1;
      const collision = `${domain}-${suffix.toString(36)}`;
      const page = project.pages[0]!;
      if (domain === "light") page.spatial!.lights[0]!.id = collision;
      else if (domain === "property") page.motion!.sceneProperties![0]!.id = collision;
      else page.motion!.sceneProperties![0]!.keyframes[0]!.id = collision;
      new EditorEngine(project);
      expect(createId(domain)).not.toBe(collision);
    }
  });

  it("owns mutable scene arrays in full batch drafts and restores exact undo snapshots", () => {
    const engine = new EditorEngine(sceneProject());
    const before = engine.getSnapshot();
    const channel = before.project.pages[0]!.motion!.sceneProperties![0]!;
    const command: Command = {
      type: "upsertMotionKeyframe",
      target: channel.target,
      time: { value: 0, rate: 1 },
      value: 45,
    };
    const pending = engine.reserveTransaction([
      { type: "renameProject", name: "Scene batch" },
      command,
    ]);
    expect(channel.keyframes[0]!.value).toBe(10);
    expect(pending.project.pages[0]!.motion!.sceneProperties![0]!.keyframes[0]!.value).toBe(45);
    expect(Object.isFrozen(pending.project.pages[0]!.motion!.sceneProperties![0]!.keyframes)).toBe(
      true,
    );
    pending.commit();
    const after = engine.getSnapshot();
    expect(after.project.pages[0]!.motion!.sceneProperties).not.toBe(
      before.project.pages[0]!.motion!.sceneProperties,
    );
    engine.undo();
    expect(engine.getSnapshot().project).toBe(before.project);
    engine.redo();
    expect(engine.getSnapshot().project).toBe(after.project);
    const restored = engine.getSnapshot();
    expect(() =>
      engine.transaction([
        { type: "renameProject", name: "Invalid scene batch" },
        { ...command, value: NaN },
      ]),
    ).toThrow();
    expect(engine.getSnapshot()).toBe(restored);
    const invalid = cloneValue(after.project);
    invalid.pages[0]!.motion!.sceneProperties![0]!.keyframes[0]!.id = "layer";
    expect(() => engine.load(invalid)).toThrow("dupliqué");
    expect(engine.getSnapshot()).toBe(restored);
  });
});
