import type { EffectParameter, NumberEffectParameter } from "../definition";
export function effectFields(namespace: string) {
  const label = (key: string) => `${namespace}:parameter.${key}`;
  return {
    number: (
      key: string,
      value: number,
      min: number,
      max: number,
      step = 0.01,
      unit = "",
    ): NumberEffectParameter => ({
      kind: "number",
      scope: "settings",
      key,
      default: value,
      labelKey: label(key),
      min,
      max,
      step,
      displayScale: 1,
      unit,
    }),
    choice: (key: string, value: string, options: readonly string[]): EffectParameter => ({
      kind: "select",
      scope: "settings",
      key,
      default: value,
      labelKey: label(key),
      options: options.map((value) => ({ value, labelKey: `${namespace}:choice.${value}` })),
    }),
    color: (key: string, value: string): EffectParameter => ({
      kind: "color",
      scope: "settings",
      key,
      default: value,
      labelKey: label(key),
    }),
    boolean: (key: string, value: boolean): EffectParameter => ({
      kind: "boolean",
      scope: "settings",
      key,
      default: value,
      labelKey: label(key),
    }),
  };
}
