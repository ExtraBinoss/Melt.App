import { pixelSortStages } from "./pixel-sort/pipeline";
import { EDGE_DETECT_STAGES } from "./edge-detect/pipeline";
import { getEffectDefinition, type Effect } from "@musart/core";
import { gradientStages } from "./gradient/pipeline";
import { transitionStages } from "./transition/pipeline";
import { EFFECT_NODES } from "./registry";
import { blurStages } from "./blur/pipeline";
import { shadowHorizontalNode, shadowNode } from "./shadow/node";
import type { EffectStage } from "./shared/stages";
export type { EffectStage } from "./shared/stages";

/** The same stage resolver owns compile warming, allocation accounting and actual rendering. */
export function effectStages(effect: Effect): readonly EffectStage[] {
  const definition = getEffectDefinition(effect.type);
  if (definition.retired || definition.source === "geometry") return [];
  if (effect.type === "pixel-sort") return pixelSortStages(effect);
  if (effect.type === "edge-detect") return EDGE_DETECT_STAGES;
  if (effect.type === "gradient") return gradientStages(effect);
  if (effect.type === "transition") return transitionStages(effect);
  if (effect.type === "blur") return blurStages(effect);
  if (effect.type === "shadow")
    return [
      { key: "shadow:x", builder: shadowHorizontalNode, final: false },
      { key: "shadow:y", builder: shadowNode, final: true },
    ];
  if (!Object.hasOwn(EFFECT_NODES, effect.type))
    throw new Error(`Effet GPU inconnu : ${effect.type}`);
  return [
    {
      key: effect.type,
      builder: EFFECT_NODES[effect.type as keyof typeof EFFECT_NODES],
      final: true,
    },
  ];
}
