import { afterEach, describe, expect, it, vi } from "vitest";
import { createEffect, createLayer, createPage, createProject } from "../../src/document/factories";
import * as validation from "../../src/document/validation";
import * as identity from "../../src/document/identity";
import * as motionValidation from "../../src/motion/validation";
import * as motionStructure from "../../src/motion/structure";
import { createSpatialLayer } from "../../src/spatial/defaults";
import { EditorEngine } from "../../src/session/engine";
import { commandMutationScope } from "../../src/session/scopes";
import type { Command, Layer } from "../../src/document/model";
import type { SpatialLayer } from "../../src/spatial/model";

function fixture() {
  const spatial = createSpatialLayer("box");
  spatial.basis = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  spatial.pivot = [0, 0, 0];
  return new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "active",
          layers: [
            createLayer("rectangle", { id: "spatial", spatial }),
            createLayer("rectangle", { id: "neighbor" }),
          ],
          motion: {
            version: 1,
            initialized: true,
            mode: "motion",
            duration: { value: 2, rate: 1 },
            frameRate: { numerator: 30, denominator: 1 },
            tracks: [
              {
                id: "track",
                layerId: "spatial",
                start: { value: 0, rate: 1 },
                end: null,
                properties: [
                  {
                    id: "roughness",
                    target: {
                      kind: "layer",
                      layerId: "spatial",
                      property: "spatial.material.roughness",
                    },
                    keyframes: [{ id: "roughness-key", time: { value: 0, rate: 1 }, value: 0.4 }],
                  },
                ],
              },
            ],
          },
        }),
        createPage({
          id: "other",
          layers: Array.from({ length: 40 }, (_, index) =>
            createLayer("rectangle", { id: `other-${index}`, effects: [createEffect("blur")] }),
          ),
        }),
      ],
    }),
  );
}
function update(type: "updateLayers" | "updateLayerPatches", spatial: SpatialLayer): Command {
  return type === "updateLayers"
    ? { type, ids: ["spatial"], patch: { spatial } }
    : { type, patches: [{ id: "spatial", patch: { spatial } }] };
}
afterEach(() => vi.restoreAllMocks());
describe("certified spatial layer replacements", () => {
  it.each(["updateLayers", "updateLayerPatches"] as const)(
    "%s pose/material batches preserve unrelated identities without global ID or validation scans",
    (type) => {
      const engine = fixture();
      const before = engine.getSnapshot();
      const settings = before.project.pages[0]!.layers[0]!.spatial!;
      const posed = { ...settings, x: 12, rotationY: 45, scaleY: 2 };
      const material = {
        ...posed,
        material: { ...settings.material, preset: "glass", roughness: 0.2, opacity: 0.6 },
      };
      const full = vi.spyOn(validation, "validateProject");
      const layer = vi.spyOn(validation, "validateLayer");
      const collect = vi.spyOn(identity, "collectProjectIds");
      const reserve = vi.spyOn(identity, "reserveProjectIds");
      const motion = vi.spyOn(motionValidation, "validateCompositionMotion");
      const prune = vi.spyOn(motionStructure, "pruneMotionProperties");
      engine.transaction([
        update(type, posed),
        update(type, material),
        { type: "renameProject", name: "Spatial batch" },
      ]);
      const after = engine.getSnapshot();
      const page = after.project.pages[0]!;
      expect(full).not.toHaveBeenCalled();
      expect(collect).not.toHaveBeenCalled();
      expect(reserve).not.toHaveBeenCalled();
      expect(motion).not.toHaveBeenCalled();
      expect(prune).not.toHaveBeenCalled();
      expect(layer).toHaveBeenCalledTimes(1);
      expect(layer.mock.calls[0]![0]).toBe(page.layers[0]);
      expect(after.project.pages[1]).toBe(before.project.pages[1]);
      expect(after.project.assets).toBe(before.project.assets);
      expect(page.layers[1]).toBe(before.project.pages[0]!.layers[1]);
      expect(page.motion).toBe(before.project.pages[0]!.motion);
      expect(page.layers[0]!.spatial).toMatchObject({
        x: 12,
        rotationY: 45,
        scaleY: 2,
        material: { preset: "glass", roughness: 0.2, opacity: 0.6 },
      });
      expect(settings.x).toBe(0);
      expect(settings.material.roughness).not.toBe(0.2);
      material.material.roughness = 0.9;
      expect(page.layers[0]!.spatial!.material.roughness).toBe(0.2);
      expect(Object.isFrozen(page.layers[0]!.spatial!.material)).toBe(true);
      engine.undo();
      expect(engine.getSnapshot().project).toBe(before.project);
      engine.redo();
      expect(engine.getSnapshot().project).toBe(after.project);
    },
  );

  it("validates malformed nested numeric/material replacements and rejects whole batches atomically", () => {
    const engine = fixture();
    const before = engine.getSnapshot();
    const settings = before.project.pages[0]!.layers[0]!.spatial!;
    const full = vi.spyOn(validation, "validateProject");
    const layer = vi.spyOn(validation, "validateLayer");
    const events = vi.fn();
    engine.subscribe(events);
    engine.subscribeCommands(events);
    for (const spatial of [
      { ...settings, x: NaN },
      { ...settings, scaleZ: 0 },
      { ...settings, bevelSegments: 2.5 },
      { ...settings, material: { ...settings.material, roughness: Infinity } },
      { ...settings, material: { ...settings.material, preset: "unknown-material" } },
    ]) {
      expect(() =>
        engine.transaction([
          { type: "renameProject", name: "Must roll back" },
          update("updateLayerPatches", spatial),
        ]),
      ).toThrow();
      expect(engine.getSnapshot()).toBe(before);
    }
    expect(full).not.toHaveBeenCalled();
    expect(layer).toHaveBeenCalledTimes(5);
    expect(events).not.toHaveBeenCalled();
  });

  it("keeps source, capabilities, frames, references and topology outside the local allowlist", () => {
    const engine = fixture();
    const project = engine.getSnapshot().project;
    const settings = project.pages[0]!.layers[0]!.spatial!;
    const movedBasis = [...settings.basis!];
    movedBasis[12] = 1;
    const replacements = [
      { ...settings, source: "sphere" },
      { ...settings, enabled: false },
      { ...settings, useModelMaterials: false },
      { ...settings, castShadow: false },
      { ...settings, receiveShadow: false },
      { ...settings, basis: movedBasis },
      { ...settings, pivot: [1, 0, 0] },
      { ...settings, id: "unexpected-spatial-id" },
      { ...settings, assetId: "unexpected-reference" },
      { ...settings, material: { ...settings.material, id: "unexpected-material-id" } },
      { ...settings, material: { ...settings.material, roughness: { id: "nested-reference" } } },
      undefined,
      null,
    ];
    for (const spatial of replacements) {
      const command = update("updateLayers", spatial as SpatialLayer);
      expect(commandMutationScope(project, "active", [command]).kind).toBe("full");
    }
    for (const patch of [
      { effects: [] },
      {
        fillGradient: {
          kind: "linear",
          angle: 0,
          stops: [
            { offset: 0, color: "#000000" },
            { offset: 1, color: "#ffffff" },
          ],
        },
      },
      { assetId: "missing" },
      { parentId: "missing" },
      { mask: null },
    ] satisfies Partial<Layer>[]) {
      expect(
        commandMutationScope(project, "active", [
          update("updateLayers", { ...settings, x: 5 }),
          { type: "updateLayers", ids: ["spatial"], patch },
        ]).kind,
      ).toBe("full");
    }
    const full = vi.spyOn(validation, "validateProject");
    engine.transaction([
      update("updateLayers", { ...settings, source: "sphere" }),
      { type: "renameProject", name: "Full source transition" },
    ]);
    expect(full).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot().project.pages[0]!.layers[0]!.spatial!.source).toBe("sphere");
    expect(engine.getSnapshot().project.pages[1]).not.toBe(project.pages[1]);
  });

  it("requires every target to have a compatible existing spatial source", () => {
    const engine = fixture();
    const project = engine.getSnapshot().project;
    const spatial = project.pages[0]!.layers[0]!.spatial!;
    expect(
      commandMutationScope(project, "active", [
        {
          type: "updateLayers",
          ids: ["spatial", "neighbor"],
          patch: { spatial },
        },
      ]).kind,
    ).toBe("full");
  });
});
