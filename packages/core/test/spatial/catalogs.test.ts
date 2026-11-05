import { expect, test } from "vitest";
import {
  SPATIAL_MATERIALS,
  SPATIAL_MATERIAL_CATEGORIES,
  spatialMaterial,
} from "../../src/spatial/materials";
import {
  SPATIAL_ENVIRONMENT_PRESETS,
  SPATIAL_ENVIRONMENT_CATEGORIES,
  spatialEnvironment,
} from "../../src/spatial/catalog/environments";
import {
  createSpatialLayer,
  createSpatialScene,
  SPATIAL_ENVIRONMENTS,
} from "../../src/spatial/defaults";
import { validateSpatialLayer, validateSpatialScene } from "../../src/spatial/validation";
import {
  createLayer,
  createPage,
  createProject,
  parseProject,
  serializeProject,
  EditorEngine,
} from "../../src/index";

const legacyMaterials = [
  "chrome",
  "aluminium",
  "brushedAluminium",
  "gold",
  "roseGold",
  "copper",
  "brass",
  "titanium",
  "plastic",
  "softPlastic",
  "rubber",
  "porcelain",
  "ceramic",
  "clay",
  "concrete",
  "stone",
  "glass",
  "smokedGlass",
  "amberGlass",
  "frostedGlass",
  "ice",
  "pearl",
  "iridescent",
  "holographic",
  "soapBubble",
  "velvet",
  "satin",
  "paint",
  "carPaint",
  "emissive",
];
const legacyEnvironments = [
  "studio",
  "softbox",
  "overcast",
  "sunset",
  "dawn",
  "night",
  "neon",
  "warm",
  "cool",
  "gallery",
  "contrast",
  "none",
];

test("categorized physical materials retain legacy identifiers and validate all real settings", () => {
  expect(SPATIAL_MATERIALS.length).toBeGreaterThanOrEqual(120);
  expect(new Set(SPATIAL_MATERIALS.map((entry) => entry.id)).size).toBe(SPATIAL_MATERIALS.length);
  expect(SPATIAL_MATERIALS.slice(0, 30).map((entry) => entry.id)).toEqual(legacyMaterials);
  for (const category of SPATIAL_MATERIAL_CATEGORIES)
    expect(
      SPATIAL_MATERIALS.filter((entry) => entry.category === category.id).length,
    ).toBeGreaterThanOrEqual(13);
  for (const material of SPATIAL_MATERIALS) {
    const spatial = { ...createSpatialLayer("sphere"), material: { ...material.settings } };
    expect(() => validateSpatialLayer(spatial)).not.toThrow();
    expect(spatialMaterial(material.id)).toBe(material);
    expect(material.settings.preset).toBe(material.id);
    expect(legacyMaterials).toContain(material.baseId);
    expect(material.color).toMatch(/^#[\dA-F]{6}$/i);
  }
  expect(() => spatialMaterial("missing-material")).toThrow(RangeError);
});

test("environment presets contain at least fifty distinct geometric illumination rigs", () => {
  expect(SPATIAL_ENVIRONMENT_PRESETS.length).toBeGreaterThanOrEqual(50);
  expect(SPATIAL_ENVIRONMENTS).toEqual(SPATIAL_ENVIRONMENT_PRESETS.map((entry) => entry.id));
  expect(SPATIAL_ENVIRONMENTS.slice(0, 12)).toEqual(legacyEnvironments);
  expect(new Set(SPATIAL_ENVIRONMENTS).size).toBe(SPATIAL_ENVIRONMENTS.length);
  const physicalLayouts = new Set(
    SPATIAL_ENVIRONMENT_PRESETS.filter((entry) => entry.id !== "none").map((entry) =>
      JSON.stringify({
        room: entry.roomSize,
        panels: entry.panels.map(({ position, size, intensity }) => ({
          position,
          size,
          intensity,
        })),
      }),
    ),
  );
  expect(physicalLayouts.size).toBeGreaterThanOrEqual(50);
  for (const environment of SPATIAL_ENVIRONMENT_PRESETS) {
    const scene = createSpatialScene();
    scene.environment.preset = environment.id;
    expect(() => validateSpatialScene(scene, new Set(), {})).not.toThrow();
    expect(spatialEnvironment(environment.id)).toBe(environment);
    expect(
      SPATIAL_ENVIRONMENT_CATEGORIES.some((category) => category.id === environment.category),
    ).toBe(true);
    expect(legacyEnvironments).toContain(environment.baseId);
    if (environment.id !== "none") expect(environment.panels.length).toBeGreaterThan(0);
    for (const panel of environment.panels) {
      expect(panel.intensity).toBeGreaterThan(0);
      expect(panel.size.every((size) => size > 0)).toBe(true);
    }
  }
  expect(() => spatialEnvironment("missing-environment")).toThrow(RangeError);
});

test("expanded catalog selections round trip and undo atomically; invalid choices preserve the snapshot", () => {
  const layer = createLayer("rectangle", { spatial: createSpatialLayer("sphere") });
  const scene = createSpatialScene();
  scene.environment.preset = SPATIAL_ENVIRONMENT_PRESETS.at(-1)!.id;
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ spatial: scene, layers: [layer] })] }),
  );
  const before = engine.getSnapshot();
  const material = SPATIAL_MATERIALS.at(-1)!;
  engine.execute({
    type: "updateLayers",
    ids: [layer.id],
    patch: {
      spatial: { ...layer.spatial!, material: { ...material.settings } },
      fill: material.color,
    },
  });
  const saved = parseProject(serializeProject(engine.getSnapshot().project));
  expect(saved.pages[0]!.layers[0]!.spatial!.material.preset).toBe(material.id);
  expect(saved.pages[0]!.spatial!.environment.preset).toBe(scene.environment.preset);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before.project);
  engine.redo();
  const valid = engine.getSnapshot();
  expect(() =>
    engine.execute({
      type: "updateLayers",
      ids: [layer.id],
      patch: {
        spatial: { ...layer.spatial!, material: { ...material.settings, preset: "invalid" } },
      },
    }),
  ).toThrow();
  expect(engine.getSnapshot()).toBe(valid);
});
