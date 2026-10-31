import { expect, test } from "vitest";
import {
  EditorEngine,
  createLayer,
  createPage,
  createProject,
  parseProject,
  serializeProject,
  createSpatialLayer,
  createSpatialScene,
  createSpatialLight,
  SPATIAL_MATERIALS,
  compileMotion,
  evaluateMotion,
  applyMotionFrame,
  readMotionValue,
  validateProject,
  validateMotionAnimationPreset,
  type MotionAnimationPreset,
} from "../../src/index";
function fixture() {
  return createProject({
    pages: [
      createPage({
        id: "page",
        spatial: createSpatialScene(),
        layers: [
          createLayer("text", { id: "hero", text: "Melt", spatial: createSpatialLayer("extrude") }),
        ],
      }),
    ],
  });
}
test("3D sources, material and independent composition lighting survive edits, undo, duplicate and portable round trips", () => {
  const engine = new EditorEngine(fixture());
  const original = engine.getSnapshot().project;
  engine.execute({
    type: "updateLayers",
    ids: ["hero"],
    patch: { spatial: { ...original.pages[0]!.layers[0]!.spatial!, rotationY: 45 } },
  });
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.spatial!.rotationY).toBe(45);
  expect(original.pages[0]!.layers[0]!.spatial!.rotationY).toBe(0);
  engine.undo();
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.spatial!.rotationY).toBe(0);
  engine.redo();
  engine.execute({ type: "duplicateLayers", ids: ["hero"] });
  expect(engine.getSnapshot().project.pages[0]!.layers[1]!.spatial!.rotationY).toBe(45);
  const scene = createSpatialScene();
  scene.environment.preset = "sunset";
  engine.execute({ type: "addPage", page: createPage({ spatial: scene }) });
  const restored = parseProject(serializeProject(engine.getSnapshot().project));
  expect(restored.pages[0]!.spatial!.environment.preset).toBe("studio");
  expect(restored.pages[1]!.spatial!.environment.preset).toBe("sunset");
  expect(SPATIAL_MATERIALS).toHaveLength(30);
});
test("invalid resources, lighting, subdivisions and material values reject atomically", () => {
  const engine = new EditorEngine(fixture()),
    before = engine.getSnapshot();
  const spatial = before.project.pages[0]!.layers[0]!.spatial!;
  for (const patch of [
    { rotationY: NaN },
    { scaleZ: 0 },
    { curveSegments: 100000 },
    { source: "glb" },
    { material: { ...spatial.material, roughness: -1 } },
  ]) {
    expect(() =>
      engine.execute({
        type: "updateLayers",
        ids: ["hero"],
        patch: { spatial: { ...spatial, ...patch } as typeof spatial },
      }),
    ).toThrow();
    expect(engine.getSnapshot()).toBe(before);
  }
  const scene = createSpatialScene();
  scene.lights.push({ ...scene.lights[0]! });
  expect(() => engine.execute({ type: "updatePage", patch: { spatial: scene } })).toThrow();
  expect(engine.getSnapshot()).toBe(before);
  const imported = fixture();
  imported.pages[0]!.spatial!.environment.assetId = "absent";
  expect(() => validateProject(imported)).toThrow();
});
test("ordinary keyframes and action channels evaluate 3D rotation and material values through the shared registry", () => {
  const project = fixture(),
    page = project.pages[0]!;
  page.motion = {
    version: 1,
    initialized: true,
    mode: "motion",
    duration: { value: 2, rate: 1 },
    frameRate: { numerator: 30, denominator: 1 },
    tracks: [
      {
        id: "track",
        layerId: "hero",
        start: { value: 0, rate: 1 },
        end: null,
        properties: [
          {
            id: "property",
            target: { kind: "layer", layerId: "hero", property: "spatial.rotationY" },
            keyframes: [
              { id: "a", time: { value: 0, rate: 1 }, value: 0 },
              { id: "b", time: { value: 1, rate: 1 }, value: 90 },
            ],
          },
        ],
        animations: [
          {
            id: "action",
            enabled: true,
            strength: 1,
            effectIds: [],
            start: { value: 0, rate: 1 },
            duration: { value: 1, rate: 1 },
            preset: {
              version: 1,
              id: "spin",
              name: "Spin",
              category: "rotate",
              duration: 1000,
              effects: [],
              channels: [
                {
                  target: { kind: "layer", property: "spatial.rotationY" },
                  operation: "add",
                  points: [
                    { at: 0, value: 0 },
                    { at: 1, value: 90 },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const preset: MotionAnimationPreset = page.motion.tracks[0]!.animations![0]!.preset;
  validateMotionAnimationPreset(preset);
  const program = compileMotion(project, { compositionId: "page" });
  const frame = applyMotionFrame(program, evaluateMotion(program, { value: 1, rate: 2 }));
  expect(
    readMotionValue(frame, { kind: "layer", layerId: "hero", property: "spatial.rotationY" }),
  ).toBe(90);
  expect(project.pages[0]!.layers[0]!.spatial!.rotationY).toBe(0);
  expect(
    readMotionValue(frame, {
      kind: "layer",
      layerId: "hero",
      property: "spatial.material.roughness",
    }),
  ).toBe(0.22);
});
test("embedded models and environments are durable asset references, with no dependency on browser handles", () => {
  const project = fixture();
  project.assets.model = {
    id: "model",
    kind: "model3d",
    name: "model.glb",
    mime: "model/gltf-binary",
    width: 100,
    height: 100,
    byteLength: 3,
    dataUrl: "data:model/gltf-binary;base64,AAAA",
  };
  project.assets.env = {
    id: "env",
    kind: "environment",
    name: "studio.hdr",
    mime: "image/vnd.radiance",
    width: 100,
    height: 50,
    byteLength: 3,
    dataUrl: "data:image/vnd.radiance;base64,AAAA",
  };
  project.pages[0]!.layers[0]!.spatial!.source = "glb";
  project.pages[0]!.layers[0]!.assetId = "model";
  project.pages[0]!.spatial!.environment.assetId = "env";
  expect(parseProject(serializeProject(project)).assets.model).toEqual(project.assets.model);
  const second = createSpatialLight();
  expect(second.id).not.toBe(project.pages[0]!.spatial!.lights[0]!.id);
});
test("composition clipboard remaps light identities and retains environment originals", async () => {
  const { copyContent, parseClipboard } = await import("../../src/clipboard/content");
  const { pasteContent } = await import("../../src/clipboard/paste");
  const project = fixture();
  project.assets.env = {
    id: "env",
    kind: "environment",
    name: "studio.hdr",
    mime: "image/vnd.radiance",
    width: 100,
    height: 50,
    byteLength: 3,
    dataUrl: "data:image/vnd.radiance;base64,AAAA",
  };
  project.pages[0]!.spatial!.environment.assetId = "env";
  const engine = new EditorEngine(project),
    original = engine.getSnapshot().project;
  const content = parseClipboard(
    copyContent(engine.getSnapshot(), { composition: true }),
    original,
  );
  let next = 0;
  const prepared = pasteContent(content, original, { x: 0, y: 0 }, () => `pasted-${++next}`);
  engine.transaction(prepared.commands);
  const pages = engine.getSnapshot().project.pages;
  expect(pages).toHaveLength(2);
  expect(pages[1]!.spatial!.lights[0]!.id).not.toBe(pages[0]!.spatial!.lights[0]!.id);
  expect(pages[1]!.spatial!.environment.assetId).toBe("env");
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(original);
});
