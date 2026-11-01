import { COLOR, LEVELS, SCALE, defineEffect, type EffectParameter } from "../definition";
import { BIT_DITHER_PARAMETERS } from "../bit-dither/definition";

/** One authoring surface; omitted settings retain the original multilevel operator. */
export const DITHER_PARAMETERS: readonly EffectParameter[] = BIT_DITHER_PARAMETERS.flatMap(
  (parameter): EffectParameter[] => {
    if (parameter.key === "method" && parameter.kind === "select")
      return [
        {
          ...parameter,
          default: "multilevel",
          options: [
            { value: "multilevel", labelKey: "bit-ditherFx:method.multilevel" },
            ...parameter.options,
          ],
        },
      ];
    if (parameter.key === "scale")
      return [
        { ...SCALE, labelKey: parameter.labelKey },
        { ...LEVELS, visibleWhen: { key: "method", values: ["multilevel"] } },
      ];
    if (parameter.key === "sourceColor") return [{ ...COLOR, labelKey: parameter.labelKey }];
    if (parameter.key === "strength")
      return [
        {
          ...parameter,
          visibleWhen: {
            key: "method",
            values: ["multilevel", "bayer2", "bayer4", "bayer8", "interleaved"],
          },
        },
      ];
    if (parameter.kind === "color")
      return [{ ...parameter, visibleWhen: { key: "color", values: ["false"] } }];
    return [parameter];
  },
);
export const DITHER_DEFINITION = defineEffect("dither", {}, DITHER_PARAMETERS);
