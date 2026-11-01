import { applySceneMotionValues } from "./scene/properties";
import type { Composition } from "../document/model";
import { markMotionComposition } from "../document/published";
import { freezeValue } from "../document/immutable";
import { ensure } from "../errors";
import type { MotionProgram } from "./compile";
import type { MotionFramePlan, MotionFrameValue } from "./evaluate";
import { applyMotionValues } from "./properties/apply";
import { evaluateMotion, isMotionFramePlanFor, motionFrameProgram } from "./evaluate";
import { motionTimeToSeconds, type MotionTime } from "./time";

/** Shared pure preview/export materialization. Unchanged layers retain their compiled identities. */
export function applyMotionFrame(program: MotionProgram, plan: MotionFramePlan): Composition {
  ensure(
    isMotionFramePlanFor(program, plan),
    "INVALID_COMMAND",
    "Motion frame belongs to a different composition or mode.",
  );
  const base = program.composition;
  if (program.mode === "static") return base;
  const active = new Set(plan.activeLayerIds);
  const values = new Map<string, MotionFrameValue[]>();
  for (const value of plan.values) {
    const grouped = values.get(value.target.layerId);
    if (grouped) grouped.push(value);
    else values.set(value.target.layerId, [value]);
  }
  const clocks =
    program.effectClocks &&
    new Map(program.effectClocks.map((entry) => [entry.layerId, entry.effectIds]));
  const seconds = clocks ? motionTimeToSeconds(plan.time) : 0;
  let changed = false;
  const layers = base.layers.map((original) => {
    let layer = applyMotionValues(original, values.get(original.id) ?? []);
    const effectIds = clocks?.get(original.id);
    if (effectIds)
      layer = {
        ...layer,
        effects: layer.effects.map((effect) =>
          effectIds.includes(effect.id)
            ? { ...effect, time: (effect.time ?? 0) + seconds }
            : effect,
        ),
      };
    // Mask sources keep their identity/graph. Their temporal absence also zeros mask coverage,
    // because the renderer's mask mapping includes visibility through the source's lineage.
    if (!active.has(original.id) && layer.visible) layer = { ...layer, visible: false };
    if (layer !== original) changed = true;
    return layer;
  });
  const scene = applySceneMotionValues(base, plan.sceneValues ?? []);
  if (!changed && scene === base) return base;
  const frame = freezeValue({ ...scene, layers });
  markMotionComposition(base, frame);
  return frame;
}

/** Deterministic random access to the same frozen source program used by preview/export. */
export function resampleMotionFrame(source: MotionFramePlan, time: MotionTime) {
  const program = motionFrameProgram(source);
  ensure(program, "INVALID_COMMAND", "Temporal sampling requires an issued Motion frame.");
  const plan = evaluateMotion(program, time, { terminalPreview: true });
  return { page: applyMotionFrame(program, plan), plan };
}

export function motionFrameComposition(plan: MotionFramePlan): Composition {
  const program = motionFrameProgram(plan);
  ensure(program, "INVALID_COMMAND", "Temporal sampling requires an issued Motion frame.");
  return program.composition;
}
