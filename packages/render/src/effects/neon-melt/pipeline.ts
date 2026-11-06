import { resolveEffectSettings, type Effect } from "@musart/core";
import { glowPartitionCount } from "../glow/kernel";
import { glowFilterStages } from "../glow/pipeline";
import type { EffectStage } from "../shared/stages";
import { neonMeltNode, neonMeltPrepareNode } from "./node";
const STAGES: readonly (readonly EffectStage[])[] = Object.freeze(
  Array.from({ length: 4 }, (_, index) => [
    { key: "neon-melt:liquid-palette", builder: neonMeltPrepareNode, final: false },
    ...glowFilterStages("neon-melt", index + 1, neonMeltNode),
  ]),
);
export function neonMeltStages(effect: Effect): readonly EffectStage[] {
  return STAGES[glowPartitionCount(Number(resolveEffectSettings(effect).radius)) - 1]!;
}
