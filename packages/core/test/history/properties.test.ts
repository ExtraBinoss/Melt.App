import { expect, it } from "vitest";
import {
  createEffect,
  createLayer,
  createSpatialLayer,
  createSpatialScene,
  getHistoryPropertyDefinition,
  type Layer,
} from "../../src/index";
import { fixture, scalar } from "./support";

it("names ordinary authored properties individually with exact values and registered presentation units", () => {
  const d = fixture([
    createLayer("text", { id: "text", fill: "#000000", spatial: createSpatialLayer() }),
  ]);
  const patch: Partial<Layer> = {
    x: 91,
    y: 92,
    width: 300,
    height: 120,
    rotation: 37,
    scaleX: 1.5,
    scaleY: 0.75,
    fill: "#ff0000",
    stroke: "#00ff00",
    strokeWidth: 3,
    opacity: 0.37,
    visible: false,
    text: "New text",
    fontFamily: "Arial",
    fontSize: 72,
    fontWeight: 700,
    lineHeight: 1.8,
    letterSpacing: 2,
    textAlign: "right",
    padding: { top: 1, right: 2, bottom: 3, left: 4 },
    margin: { top: 5, right: 6, bottom: 7, left: 8 },
    spatial: {
      ...d.page().layers[0]!.spatial!,
      z: 3,
      rotationY: 45,
      material: { ...d.page().layers[0]!.spatial!.material, roughness: 0.23 },
    },
  };
  d.engine.execute({ type: "updateLayers", ids: ["text"], patch });
  const byProperty = new Map(d.properties().map((change) => [change.target.property, change]));
  for (const key of [
    "x",
    "y",
    "width",
    "height",
    "rotation",
    "scaleX",
    "scaleY",
    "fill",
    "stroke",
    "strokeWidth",
    "opacity",
    "visible",
    "text",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "letterSpacing",
    "textAlign",
    "padding.top",
    "margin.left",
    "spatial.z",
    "spatial.rotationY",
    "spatial.material.roughness",
  ])
    expect(byProperty.has(key as never), key).toBe(true);
  expect(byProperty.get("scaleX")!.before).toEqual(scalar(1));
  expect(byProperty.get("opacity")!.after).toEqual(scalar(0.37));
  expect(getHistoryPropertyDefinition(byProperty.get("opacity")!.target)).toMatchObject({
    displayScale: 100,
    unit: "%",
  });
  expect(getHistoryPropertyDefinition(byProperty.get("rotation")!.target)).toMatchObject({
    unit: "°",
  });
  expect(
    getHistoryPropertyDefinition(byProperty.get("spatial.material.roughness")!.target)!.label,
  ).toEqual({ source: "spatial", property: "material.roughness" });
  expect(d.description().additionalChanges).toBe(false);
});

it("keeps vector fill plus original-color changes specific and distinguishes gradient topology from scalar angle/type", () => {
  const d = fixture([
    createLayer("vector", {
      id: "vector",
      fill: "#000000",
      vector: {
        viewBox: "0 0 10 10",
        parts: [{ path: "M0 0L10 0L10 10Z", fill: "#ff0000" }],
        preserveColors: true,
      } as Layer["vector"],
    }),
  ]);
  const vector = d.page().layers[0]!.vector!;
  d.engine.execute({
    type: "updateLayers",
    ids: ["vector"],
    patch: { fill: "#00ff00", vector: { ...vector, preserveColors: false } },
  });
  expect(d.properties().map((change) => change.target.property)).toEqual([
    "fill",
    "vector.preserveColors",
  ]);
  expect(
    d
      .description()
      .changes.some((change) => change.kind === "action" && change.action === "geometry"),
  ).toBe(false);
  const gradient = {
    kind: "linear" as const,
    angle: 0,
    stops: [
      { offset: 0, color: "#000000" },
      { offset: 1, color: "#ffffff" },
    ],
  };
  d.engine.execute({ type: "updateLayers", ids: ["vector"], patch: { fillGradient: gradient } });
  expect(d.description().changes).toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: "action", action: "gradientStops" })]),
  );
  d.engine.execute({
    type: "updateLayers",
    ids: ["vector"],
    patch: { fillGradient: { ...gradient, kind: "radial", angle: 90 } },
  });
  expect(d.properties().map((change) => change.target.property)).toEqual([
    "fillGradient.angle",
    "fillGradient.kind",
  ]);
  expect(d.description().changes).toHaveLength(2);
});

it("uses each effect's actual registered setting label, choice and scale without inventing geometry for cloned morph data", () => {
  const effect = createEffect("gradient", { id: "gradient" });
  const morph = createEffect("morph", {
    id: "morph",
    shapeMorph: {
      version: 1,
      shapes: [
        {
          frames: [0, 1].map((at) => ({
            at,
            box: [0, 0, 1, 1] as [number, number, number, number],
            contours: [
              {
                hole: false,
                points: [
                  [0, 0],
                  [1, 0],
                  [0, 1],
                ] as [number, number][],
              },
            ],
          })),
        },
      ],
    },
  });
  const d = fixture([createLayer("text", { id: "text", effects: [effect, morph] })]);
  const current = d.page().layers[0]!.effects;
  d.engine.execute({
    type: "updateLayers",
    ids: ["text"],
    patch: {
      effects: current.map((item) => (item.id === "morph" ? { ...item, amount: 0.5 } : item)),
    },
  });
  expect(d.properties()).toHaveLength(1);
  expect(d.properties()[0]).toMatchObject({
    target: {
      owner: { kind: "effect", effectId: "morph", effectType: "morph" },
      property: "amount",
    },
    after: scalar(0.5),
  });
  expect(d.description().changes).toHaveLength(1);
  expect(getHistoryPropertyDefinition(d.properties()[0]!.target)).toMatchObject({
    displayScale: 100,
    unit: "%",
    label: { source: "effect", key: "amount", scope: "root" },
  });
  const definition = getHistoryPropertyDefinition({
    owner: {
      kind: "effect",
      compositionId: "page",
      layerId: "text",
      effectId: "gradient",
      effectType: "gradient",
    },
    property: "settings.style",
  });
  expect(definition).toMatchObject({ kind: "choice", label: { scope: "settings", key: "style" } });
  expect(definition!.choiceLabels!.length).toBeGreaterThan(1);
  expect(
    getHistoryPropertyDefinition({
      owner: {
        kind: "effect",
        compositionId: "page",
        layerId: "text",
        effectId: "gradient",
        effectType: "gradient",
      },
      property: "settings.unregistered",
    }),
  ).toBeNull();
});

it("keeps camera, light, environment, reflections and 3D structural transforms distinct", () => {
  const d = fixture([createLayer("rectangle", { id: "item", spatial: createSpatialLayer() })]);
  const scene = createSpatialScene();
  scene.lights[0]!.id = "light";
  d.engine.execute({ type: "updatePage", patch: { spatial: scene } });
  const old = d.page().spatial!;
  d.engine.execute({
    type: "updatePage",
    patch: {
      spatial: {
        ...old,
        camera: { ...old.camera, yaw: 90 },
        environment: { ...old.environment, intensity: 2 },
        lights: old.lights.map((light) => ({ ...light, color: "#ff0000", intensity: 4 })),
        reflections: { mode: "environment", quality: "high" },
      },
    },
  });
  expect(
    d.properties().map((change) => `${change.target.owner.kind}:${change.target.property}`),
  ).toEqual(
    expect.arrayContaining([
      "camera:yaw",
      "environment:intensity",
      "light:color",
      "light:intensity",
      "composition:reflections.mode",
      "composition:reflections.quality",
    ]),
  );
  expect(
    d.properties().find((change) => change.target.owner.kind === "light")!.target.owner,
  ).toMatchObject({ lightId: "light" });
  const spatial = d.page().layers[0]!.spatial!;
  d.engine.execute({
    type: "updateLayers",
    ids: ["item"],
    patch: { spatial: { ...spatial, pivot: [1, 2, 3] } },
  });
  expect(d.description().changes).toEqual([
    {
      kind: "action",
      action: "spatialTransform",
      owner: { kind: "layer", compositionId: "page", layerId: "item" },
    },
  ]);
});
