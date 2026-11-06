import { expect, it } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  parseProject,
  serializeProject,
  validateProject,
} from "../../../src/index";
import {
  BLUR_DEFAULT_SETTINGS,
  BLUR_DEFINITION,
  BLUR_TECHNIQUES,
} from "../../../src/effects/blur/definition";
import { isEffectParameterVisible, patchEffectParameter } from "../../../src/effects/parameters";
import { EFFECT_DOMAIN_PARAMETERS } from "../../../src/effects/sdk/domain";
import { resolveEffectSettings } from "../../../src/effects/settings";

const parameter = (key: string) => BLUR_DEFINITION.parameters.find((item) => item.key === key)!;

it("retains old Gaussian defaults and declares one immutable, bounded blur library", () => {
  const effect = createEffect("blur");
  const legacy = { ...effect, settings: undefined };
  expect(resolveEffectSettings(legacy)).toEqual({
    ...BLUR_DEFAULT_SETTINGS,
    ...Object.fromEntries(EFFECT_DOMAIN_PARAMETERS.map((p) => [p.key, p.default])),
  });
  expect(effect).toMatchObject({ type: "blur", amount: 1, scale: 2 });
  expect(BLUR_DEFINITION.coverage).toBe("expand");
  expect(BLUR_TECHNIQUES).toEqual([
    "gaussian",
    "box",
    "directional",
    "spin",
    "zoom",
    "lens",
    "bilateral",
    "progressive",
  ]);
  expect(Object.isFrozen(BLUR_DEFINITION.defaults.settings)).toBe(true);
  expect(BLUR_DEFINITION.parameters.filter((item) => item.key === "technique")).toHaveLength(1);
  expect(BLUR_DEFINITION.gizmo).toMatchObject({
    kind: "radial",
    enabled: "protect",
    radius: "protectedRadius",
    feather: "feather",
  });
  expect(BLUR_DEFINITION.parameters.some((item) => item.key === "time")).toBe(false);
  for (const item of BLUR_DEFINITION.parameters) {
    if (item.kind !== "number" || item.scope !== "settings") continue;
    expect(item.default).toBeGreaterThanOrEqual(item.min);
    expect(item.default).toBeLessThanOrEqual(item.max);
    expect(item.step).toBeGreaterThan(0);
  }
});

it("exposes technique-owned parameters and opt-in protection fields", () => {
  for (const technique of BLUR_TECHNIQUES) {
    const effect = createEffect("blur", { settings: { technique } });
    for (const [key, techniques] of [
      ["angle", ["directional", "progressive"]],
      ["spinAngle", ["spin"]],
      ["zoomStrength", ["zoom"]],
      ["apertureBlades", ["lens"]],
      ["apertureRotation", ["lens"]],
      ["rangeSigma", ["bilateral"]],
    ] as const)
      expect(isEffectParameterVisible(effect, parameter(key)), `${technique}.${key}`).toBe(
        (techniques as readonly string[]).includes(technique),
      );
    expect(isEffectParameterVisible(effect, parameter("protectedRadius"))).toBe(false);
    expect(
      isEffectParameterVisible(
        { ...effect, settings: { technique, protect: true } },
        parameter("feather"),
      ),
    ).toBe(true);
  }
});

it("round-trips each real technique and atomically rejects invalid settings through commands", () => {
  const effect = createEffect("blur"),
    engine = new EditorEngine(
      createProject({
        pages: [
          createPage({ layers: [createLayer("rectangle", { id: "card", effects: [effect] })] }),
        ],
      }),
    );
  for (const technique of BLUR_TECHNIQUES) {
    const patch = patchEffectParameter(effect, parameter("technique"), technique);
    const next = {
      ...effect,
      ...patch,
      settings: { ...patch.settings, protect: true, centerX: 0, feather: 0 },
    };
    const before = engine.getSnapshot().project;
    engine.execute({ type: "updateLayers", ids: ["card"], patch: { effects: [next] } });
    const after = engine.getSnapshot().project;
    expect(parseProject(serializeProject(after))).toEqual(after);
    engine.undo();
    expect(engine.getSnapshot().project).toEqual(before);
    engine.redo();
    expect(engine.getSnapshot().project).toEqual(after);
  }
  const before = engine.getSnapshot().project;
  for (const settings of [
    { technique: "temporal-motion" },
    { apertureBlades: 4.5 },
    { rangeSigma: 0 },
    { centerX: 1.01 },
    { protect: 1 },
    { protectedRadius: -1 },
    { feather: 2049 },
    { depth: 1 },
    { spinAngle: Infinity },
    { zoomStrength: 2.1 },
  ] as const) {
    const invalid = structuredClone(before);
    invalid.pages[0]!.layers[0]!.effects[0]!.settings = settings;
    expect(() => validateProject(invalid)).toThrow();
    expect(() =>
      engine.execute({
        type: "updateLayers",
        ids: ["card"],
        patch: { effects: [{ ...effect, settings }] },
      }),
    ).toThrow();
    expect(engine.getSnapshot().project).toEqual(before);
  }
});

it("exposes progressive stops only for its real convolution technique and validates them", () => {
  const progressive = createEffect("blur", {
    settings: { technique: "progressive", gradientStart: 0.8, gradientEnd: 0.2 },
  });
  const gaussian = createEffect("blur");
  for (const key of [
    "gradientShape",
    "gradientStart",
    "gradientEnd",
    "gradientPower",
    "gradientInvert",
  ]) {
    const field = parameter(key);
    expect(isEffectParameterVisible(progressive, field)).toBe(true);
    expect(isEffectParameterVisible(gaussian, field)).toBe(false);
  }
  const project = createProject({
    pages: [createPage({ layers: [createLayer("rectangle", { effects: [progressive] })] })],
  });
  expect(() => validateProject(project)).not.toThrow();
  for (const settings of [
    { gradientStart: -0.1 },
    { gradientEnd: 1.1 },
    { gradientPower: 0 },
    { gradientShape: "fake" },
  ]) {
    const invalid = structuredClone(project);
    invalid.pages[0]!.layers[0]!.effects[0]!.settings = { technique: "progressive", ...settings };
    expect(() => validateProject(invalid)).toThrow();
  }
});
