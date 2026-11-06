import { expect, test } from "vitest";
import {
  createEffect,
  getEffectDefinition,
  resolveEffectSettings,
  validateEffectParameter,
} from "../../../src/index";

test("native DOF preserves manual focus defaults and declares native layer/composition depth", () => {
  const definition = getEffectDefinition("depth-of-field");
  expect(definition.requirements).toEqual({ depth: true });
  expect(resolveEffectSettings(createEffect("depth-of-field"))).toMatchObject({
    focusMode: "distance",
    focusDistance: 8,
    focusX: 0.5,
    focusY: 0.5,
  });
  for (const key of ["focusX", "focusY"]) {
    const parameter = definition.parameters.find((parameter) => parameter.key === key)!;
    expect(parameter.visibleWhen).toEqual({ key: "focusMode", values: ["point"] });
    expect(() => validateEffectParameter(parameter, -0.1, "INVALID_DOCUMENT")).toThrow();
    expect(() => validateEffectParameter(parameter, 1.1, "INVALID_DOCUMENT")).toThrow();
    expect(() => validateEffectParameter(parameter, 0.75, "INVALID_DOCUMENT")).not.toThrow();
  }
  const mode = definition.parameters.find((parameter) => parameter.key === "focusMode")!;
  expect(() => validateEffectParameter(mode, "point", "INVALID_DOCUMENT")).not.toThrow();
  expect(() => validateEffectParameter(mode, "radial", "INVALID_DOCUMENT")).toThrow();
});
