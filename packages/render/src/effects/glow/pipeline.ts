import { resolveEffectSettings, type Effect } from "@musart/core";
import type { EffectNodeBuilder } from "../shared/context";
import type { EffectStage } from "../shared/stages";
import { glowAxis, glowNode, glowPartitionMixture, glowPartitionRadius } from "./node";
import { glowPartitionCount } from "./kernel";

/** Coarse sampling follows dense prefiltering, avoiding isolated highlight replicas. */
export function glowFilterStages(
  prefix: string,
  partitions: number,
  finish: EffectNodeBuilder,
): readonly EffectStage[] {
  const stages: EffectStage[] = [];
  for (let partition = 0; partition < partitions; partition++) {
    const last = partition === partitions - 1;
    stages.push({
      key: `${prefix}:${partitions}:${partition}:bright-x`,
      builder: (context) =>
        glowAxis(
          context,
          "x",
          partition === 0,
          glowPartitionRadius(context, partition),
          glowPartitionMixture(context, partition),
        ),
      final: false,
    });
    stages.push({
      key: `${prefix}:${partitions}:${partition}:y`,
      builder: last
        ? finish
        : (context) =>
            glowAxis(
              context,
              "y",
              false,
              glowPartitionRadius(context, partition),
              glowPartitionMixture(context, partition),
            ),
      final: last,
    });
  }
  return stages;
}
const STAGES = Object.freeze(
  Array.from({ length: 4 }, (_, index) => glowFilterStages("glow", index + 1, glowNode)),
);
export function glowStages(effect: Effect): readonly EffectStage[] {
  return STAGES[glowPartitionCount(Number(resolveEffectSettings(effect).radius)) - 1]!;
}
