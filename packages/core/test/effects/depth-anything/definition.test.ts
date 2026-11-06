import { expect, it } from "vitest";
import { createEffect, getEffectDefinition } from "../../../src/index";
import { validateEffectInputs } from "../../../src/effects/inputs";
it("declares prepared depth separately from native camera depth and validates references", () => {
  const effect = createEffect("depth-anything", { inputs: { depth: "map" } });
  expect(getEffectDefinition(effect.type).requirements?.depth).toBeUndefined();
  expect(
    getEffectDefinition(effect.type).parameters.find((p) => p.key === "strength"),
  ).toMatchObject({ default: 24 });
  expect(getEffectDefinition(effect.type).parameters.find((p) => p.key === "view")).toMatchObject({
    default: "depth",
  });
  expect(() => validateEffectInputs(effect, {})).toThrow();
  expect(() =>
    validateEffectInputs(effect, {
      map: {
        id: "map",
        name: "Depth",
        mime: "image/png",
        width: 1,
        height: 1,
        dataUrl: "data:image/png;base64,AA==",
      },
    }),
  ).not.toThrow();
  expect(() => validateEffectInputs({ ...effect, inputs: { unknown: "map" } })).toThrow();
});
