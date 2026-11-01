import { resolveEffectSettings, type Effect } from "@musart/core";
import type { EffectStage } from "../shared/stages";
import { pixelSortFinishNode, pixelSortStep } from "./node";
const networks = new Map<number, readonly EffectStage[]>();
/** Four validated sizes bound both shader variants and work; never sorts on the CPU. */
export function pixelSortStages(effect: Effect): readonly EffectStage[] {
  const size = Number(resolveEffectSettings(effect).window);
  if (![8, 16, 32, 64].includes(size)) throw new Error("Invalid Pixel Sort segment length.");
  let stages = networks.get(size);
  if (!stages) {
    const steps: EffectStage[] = [];
    for (let span = 2; span <= size; span *= 2)
      for (let stride = span / 2; stride >= 1; stride /= 2)
        steps.push({
          key: `pixel-sort:${size}:${span}:${stride}`,
          builder: pixelSortStep(size, span, stride),
          final: false,
        });
    steps.push({ key: "pixel-sort:finish", builder: pixelSortFinishNode, final: true });
    stages = Object.freeze(steps);
    networks.set(size, stages);
  }
  return stages;
}
