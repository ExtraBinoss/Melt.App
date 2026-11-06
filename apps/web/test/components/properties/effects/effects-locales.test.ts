import { expect, it } from "vitest";
import {
  EFFECT_CATALOG,
  BLEND_MODES,
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
} from "@musart/core";
import { i18n } from "../../../../src/state/i18n";
import { supportedLocales } from "../../../../src/state/i18n/locales";
import { libraryMessages } from "../../../../src/components/properties/effects/library-messages";
import { messages as controls } from "../../../../src/components/properties/effects/messages";
import { messages as domain } from "../../../../src/components/properties/effects/sdk/messages";
import { messages as motion } from "../../../../src/components/properties/effects/effect-motion/messages";
import { messages as gradient } from "../../../../src/components/properties/effects/gradient-messages";
import { messages as material } from "../../../../src/components/properties/effects/library/material/messages";
import { messages as gizmo } from "../../../../src/canvas/effects/messages";
import { messages as catalog } from "../../../../src/components/layers/catalog/messages";
import {
  effectMotionProperties,
  effectPropertyOptionLabel,
} from "../../../../src/components/properties/effects/effect-motion/authoring";
import { messages as transitions } from "../../../../src/components/motion/transitions/messages";
import "../../../../src/components/search/messages";

type Resources = Record<string, Record<string, unknown>>;
function leaves(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") return { [prefix]: value };
  if (!value || typeof value !== "object") throw new Error(`Invalid translation at ${prefix}`);
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      Object.entries(leaves(child, prefix ? `${prefix}.${key}` : key)),
    ),
  );
}
function local(key: string, language: string): unknown {
  const colon = key.indexOf(":");
  return i18n.getResource(
    language,
    colon < 0 ? "translation" : key.slice(0, colon),
    colon < 0 ? key : key.slice(colon + 1),
  );
}

it("owns complete effect, shared control and catalog copy in every advertised language without English fallback", () => {
  const namespaces: Record<string, Resources> = {
    effectControls: controls,
    effectDomain: domain,
    effectGizmo: gizmo,
    effectMotion: motion,
    gradientFx: gradient,
    materialFx: material,
    effectCatalog: catalog,
    transitions,
    ...Object.fromEntries(
      Object.entries(libraryMessages).map(([id, resources]) => [`${id}Fx`, resources]),
    ),
  };
  for (const [namespace, resources] of Object.entries(namespaces)) {
    const english = leaves(resources.en);
    for (const { code } of supportedLocales) {
      expect(resources[code], `${namespace}/${code}`).toBeDefined();
      const translated = leaves(resources[code]);
      expect(Object.keys(translated).sort(), `${namespace}/${code}`).toEqual(
        Object.keys(english).sort(),
      );
      for (const [key, text] of Object.entries(translated)) {
        expect(text.trim(), `${namespace}/${code}/${key}`).toBeTruthy();
        expect(text.match(/{{[^}]+}}/g)?.sort() ?? [], `${namespace}/${code}/${key}`).toEqual(
          english[key]!.match(/{{[^}]+}}/g)?.sort() ?? [],
        );
        expect(local(`${namespace}:${key}`, code), `${namespace}/${code}/${key}`).toBe(text);
      }
    }
  }
});

it("resolves every registered effect name, parameter, option and description from its actual locale bundle", () => {
  const missing: string[] = [];
  for (const { code } of supportedLocales)
    for (const definition of Object.values(EFFECT_CATALOG)) {
      const keys = [
        definition.nameKey,
        `effectCatalog:description.${definition.type}`,
        `search:effectDescriptions.${definition.type}`,
        `search:effectLabels.${definition.type}`,
        ...definition.parameters.flatMap((parameter) => [
          parameter.labelKey,
          ...(parameter.kind === "select"
            ? parameter.options.map((option) => option.labelKey)
            : []),
        ]),
        ...(definition.inputs?.map((input) => input.labelKey) ?? []),
      ];
      for (const key of keys) {
        const value = local(key, code);
        if (typeof value !== "string" || !value.trim())
          missing.push(`${code}/${definition.type}/${key}`);
      }
    }
  expect(missing).toEqual([]);
});

it("localizes Motion choice endpoints through SDK labels while keeping portable values unchanged", () => {
  const effect = createEffect("wave-distortion");
  const engine = new EditorEngine(
    createProject({
      pages: [createPage({ layers: [createLayer("rectangle", { effects: [effect] })] })],
    }),
  );
  const properties = effectMotionProperties(engine, effect);
  const waveform = properties.find((p) => p.target.property === "waveform")!;
  const blend = properties.find((p) => p.target.property === "blendMode")!;
  expect(waveform.kind).toBe("choice");
  if (waveform.kind !== "choice") throw new Error("Waveform choice expected");
  expect(waveform.options).toEqual(["sine", "triangle", "square", "sawtooth"]);
  for (const { code } of supportedLocales) {
    for (const value of waveform.options) {
      const key = effectPropertyOptionLabel(effect, waveform, value);
      expect(key).toBe(`wave-distortionFx:choice.${value}`);
      expect(local(key, code), `${code}/${value}`).toEqual(expect.any(String));
    }
    for (const value of BLEND_MODES) {
      const key = effectPropertyOptionLabel(effect, blend, value);
      expect(key).toBe(`blend.${value}`);
      expect(local(key, code), `${code}/${value}`).toEqual(expect.any(String));
    }
    for (const key of [
      "opacity",
      "blendMode",
      "effects",
      "addEffect",
      "addAdjustment",
      "noEffects",
      "effectClipped",
      "disableEffect",
      "enableEffect",
      "moveEffectUp",
      "moveEffectDown",
      "removeEffect",
      "reset",
      "colorPicker",
      "composition",
    ])
      expect(local(key, code), `${code}/${key}`).toEqual(expect.any(String));
  }
});
