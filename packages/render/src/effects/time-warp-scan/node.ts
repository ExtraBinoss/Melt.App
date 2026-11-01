import { clamp, max, mix, smoothstep, uv, vec4 } from "three/tsl";
import type { EffectNodeContext } from "../shared/context";
import { sampleEffect } from "../shared/context";
import { mixEffectCoverage } from "../shared/compositing/node";
import { scanCoordinate, scanSample, warpCoordinate } from "./field";

/** Stateless image fallback, or a GPU-captured strip history from the same source pipeline. */
export function timeWarpScanNode({ source, controls, temporal }: EffectNodeContext) {
  const position = uv(),
    p = controls.parameters;
  const phase = clamp(temporal?.phase ?? p.progress!, 0, 1).toVar();
  const coordinate = scanCoordinate(position, controls).toVar();
  const current = scanSample(source, warpCoordinate(position, phase, controls), controls);
  const staticHistory = scanSample(
    source,
    warpCoordinate(position, clamp(coordinate, 0, 1), controls),
    controls,
  );
  const history = temporal
    ? mixEffectCoverage(
        staticHistory,
        sampleEffect(
          temporal.source,
          { ...controls, sourceFlipY: temporal.flipY },
          position.mul(temporal.region.zw).add(temporal.region.xy),
        ),
        temporal.enabled,
      )
    : staticHistory;
  const axis = p
    .direction!.lessThan(2)
    .select(controls.contentResolution.y, controls.contentResolution.x)
    .toVar();
  const feather = max(0.000001, p.feather!.div(axis));
  const behind = smoothstep(phase.sub(feather), phase, coordinate).oneMinus();
  const frozen = phase.greaterThanEqual(1).select(1, phase.lessThanEqual(0).select(0, behind));
  const result = mixEffectCoverage(current, history, frozen);
  const line = smoothstep(
    p.lineWidth!.div(axis).mul(0.5),
    p.lineWidth!.div(axis).mul(0.5).add(feather),
    coordinate.sub(phase).abs(),
  )
    .oneMinus()
    .mul(p.showLine!)
    .mul(phase.greaterThan(0).and(phase.lessThan(1)).select(1, 0));
  const scanned = vec4(mix(result.rgb, controls.colors.lineColor!, line), max(result.a, line));
  return mixEffectCoverage(sampleEffect(source, controls, position), scanned, controls.amount);
}
