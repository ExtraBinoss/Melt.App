import { expect, it } from "vitest";
import { createEffect } from "../../src/document/factories";
import type { ImageAsset } from "../../src/document/model";
import {
  captureEffectTreatment,
  effectMatchesTreatment,
  instantiateEffectTreatment,
  validateEffectTreatment,
} from "../../src/effects/presets";
import { validateEffectExtensions } from "../../src/effects/validation";

const map: ImageAsset = {
  id: "map",
  name: "Displacement",
  width: 2,
  height: 2,
  mime: "image/png",
  dataUrl: "data:image/png;base64,AAAA",
};
it("captures literal values and domain settings, excluding project links and source-owned outputs", () => {
  const source = createEffect("gradient", {
    id: "gradient",
    settings: { color0: "#112233", domainX: 0.3 },
    colorLinks: { color0: "token" },
    preset: { id: "old", name: "Old" },
  });
  const record = captureEffectTreatment("saved", "  Poster ink  ", [source], {}, "effect");
  expect(record.name).toBe("Poster ink");
  expect(record.effects[0]).toMatchObject({ settings: { color0: "#112233", domainX: 0.3 } });
  expect(record.effects[0]?.colorLinks).toBeUndefined();
  expect(record.effects[0]?.preset).toBeUndefined();
  expect(source.colorLinks).toEqual({ color0: "token" });
  for (const effect of [
    createEffect("liquify", { liquify: [] }),
    createEffect("morph"),
    createEffect("depth-anything", { inputs: { depth: "map" } }),
  ]) {
    const saved = captureEffectTreatment("saved", "Reusable", [effect], { map }, "effect");
    expect(saved.effects[0]?.liquify).toBeUndefined();
    expect(saved.effects[0]?.shapeMorph).toBeUndefined();
    expect(saved.effects[0]?.inputs).toBeUndefined();
    expect(saved.assets).toEqual({});
  }
});
it("remaps embedded originals and creates independent ordered copies on every application", () => {
  const effects = [
    createEffect("displace", { id: "displace", inputs: { map: "map" } }),
    createEffect("grain", { id: "grain", amount: 0.4 }),
  ];
  const saved = captureEffectTreatment("saved", "Paper stack", effects, { map }, "stack");
  let id = 0;
  const first = instantiateEffectTreatment(saved, () => `copy-${++id}`);
  const second = instantiateEffectTreatment(saved, () => `copy-${++id}`);
  expect(first.effects.map((effect) => effect.type)).toEqual(["displace", "grain"]);
  expect(first.effects[0]?.inputs?.map).toBe(first.assets[0]?.id);
  expect(second.effects[0]?.inputs?.map).not.toBe(first.assets[0]?.id);
  first.effects[1]!.amount = 0.9;
  first.assets[0]!.name = "Changed";
  expect(second.effects[1]?.amount).toBe(0.4);
  expect(saved.assets.map?.name).toBe("Displacement");
  expect(first.effects[0]?.preset).toBeUndefined();
});
it("compares effective settings and input content independently of new identities", () => {
  const effect = createEffect("displace", { id: "a", inputs: { map: "map" } });
  const saved = captureEffectTreatment("saved", "Displacement", [effect], { map }, "effect");
  let id = 0;
  const copy = instantiateEffectTreatment(saved, () => `copy-${++id}`);
  const assets = Object.fromEntries(copy.assets.map((asset) => [asset.id, asset]));
  expect(effectMatchesTreatment(copy.effects[0]!, saved, assets)).toBe(true);
  expect(
    effectMatchesTreatment(
      {
        ...copy.effects[0]!,
        settings: { ...copy.effects[0]!.settings, domainX: 0.5 },
        opacity: 1,
        blendMode: "normal",
        composite: "source-over",
      },
      saved,
      assets,
    ),
  ).toBe(true);
  copy.effects[0]!.amount += 0.1;
  expect(effectMatchesTreatment(copy.effects[0]!, saved, assets)).toBe(false);
});
it("rejects missing originals, project references, invalid names and malformed records", () => {
  expect(() =>
    captureEffectTreatment(
      "saved",
      "Missing",
      [createEffect("displace", { inputs: { map: "missing" } })],
      {},
      "effect",
    ),
  ).toThrow();
  const record = captureEffectTreatment("saved", "Valid", [createEffect("grain")], {}, "effect");
  for (const invalid of [
    { ...record, name: " " },
    { ...record, effects: [] },
    { ...record, effects: [{ ...record.effects[0], colorLinks: { color: "token" } }] },
    { ...record, effects: [{ ...record.effects[0], preset: { id: "id", name: "Name" } }] },
    { ...record, assets: { map: { ...map, id: "wrong" } } },
  ])
    expect(() => validateEffectTreatment(invalid)).toThrow();
  for (const preset of [
    { id: "", name: "Name" },
    { id: "id", name: " " },
    { id: "id", name: "Name", extra: true },
  ])
    expect(() => validateEffectExtensions({ preset })).toThrow();
});
