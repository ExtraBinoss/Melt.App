import { atom, type PrimitiveAtom } from "jotai";
import type { EnginePort, SpatialSnapCue } from "@musart/core";
const atoms = new WeakMap<EnginePort, PrimitiveAtom<readonly SpatialSnapCue[]>>();
/** Transient presentation only. Subscribe through store.sub during gestures, never editor roots. */
export function spatialSnapFeedbackAtom(engine: EnginePort) {
  let value = atoms.get(engine);
  if (!value) {
    value = atom<readonly SpatialSnapCue[]>([]);
    atoms.set(engine, value);
  }
  return value;
}
