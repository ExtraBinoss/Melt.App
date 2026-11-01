import { expect, test } from "vitest";
import { createEffect } from "../../src/document/factories";
import { EFFECT_CATALOG } from "../../src/effects/catalog";
import { getEffectParameter } from "../../src/effects/parameters";
import { resolveEffectSettings } from "../../src/effects/settings";

test("scalar settings reads preserve complete resolution across effect schemas and authored overrides", () => {
  for (const definition of Object.values(EFFECT_CATALOG)) {
    const effect = createEffect(definition.type);
    for (const parameter of definition.parameters) {
      if (!("scope" in parameter) || parameter.scope !== "settings") continue;
      expect(getEffectParameter(effect, parameter)).toEqual(
        resolveEffectSettings(effect)[parameter.key],
      );
      const sparse = { ...effect, settings: undefined };
      expect(getEffectParameter(sparse, parameter)).toEqual(
        resolveEffectSettings(sparse)[parameter.key],
      );
      const original = getEffectParameter(effect, parameter);
      const authored = { ...effect, settings: { ...effect.settings, [parameter.key]: original } };
      expect(getEffectParameter(authored, parameter)).toEqual(
        resolveEffectSettings(authored)[parameter.key],
      );
    }
  }
});

test("scalar reads preserve zero/false and reject explicit undefined instead of silently restoring defaults", () => {
  const definition = EFFECT_CATALOG.crt;
  const parameter = definition.parameters.find(
    (p) => "scope" in p && p.scope === "settings" && p.kind === "number",
  )!;
  const zero = createEffect("crt", { settings: { [parameter.key]: 0 } });
  expect(getEffectParameter(zero, parameter)).toBe(0);
  expect(() =>
    getEffectParameter({ ...zero, settings: { [parameter.key]: undefined } }, parameter),
  ).toThrow("missing");
  const toggle = EFFECT_CATALOG.shatter.parameters.find(
    (p) => "scope" in p && p.scope === "settings" && p.kind === "boolean",
  )!;
  expect(
    getEffectParameter(createEffect("shatter", { settings: { [toggle.key]: false } }), toggle),
  ).toBe(false);
});
