import { atom } from "jotai";
import type { EnginePort } from "@musart/core";
const scopes = new WeakMap<EnginePort, ReturnType<typeof createAtoms>>();

export function rememberDockPin(
  previous: ReadonlyMap<string, boolean>,
  key: string,
  pinned: boolean,
) {
  if (previous.get(key) === pinned) return previous;
  const next = new Map(previous);
  next.delete(key);
  next.set(key, pinned);
  if (next.size > 32) next.delete(next.keys().next().value!);
  return next;
}
function owner(engine: EnginePort) {
  const snapshot = engine.getSnapshot();
  return {
    scope: JSON.stringify([snapshot.project.id, snapshot.pageId]),
    pageId: snapshot.pageId,
    mode:
      snapshot.project.pages.find((page) => page.id === snapshot.pageId)?.motion?.mode ?? "static",
  };
}
function createAtoms(engine: EnginePort) {
  const initial = owner(engine);
  const observed = atom({ scope: initial.scope, mode: initial.mode, pin: 0 });
  const pinChoices = atom<ReadonlyMap<string, boolean>>(new Map());
  const lastMotionPage = atom<string | null>(initial.mode === "motion" ? initial.pageId : null);
  // The engine bridge publishes one Jotai transaction outside React render/effects.
  // onMount gives that bridge exactly the lifetime of its UI subscribers.
  const transition = atom(
    (get) => get(observed),
    (get, set) => {
      const next = owner(engine),
        previous = get(observed);
      if (next.mode === "motion") set(lastMotionPage, next.pageId);
      if (previous.scope === next.scope && previous.mode === next.mode) return;
      const entered = previous.scope === next.scope && next.mode === "motion";
      set(observed, {
        scope: next.scope,
        mode: next.mode,
        pin: previous.scope === next.scope ? previous.pin + Number(entered) : 0,
      });
      if (entered) set(pinChoices, (choices) => rememberDockPin(choices, next.scope, true));
    },
  );
  transition.onMount = (sync) => {
    const stop = engine.subscribe(sync);
    sync();
    return stop;
  };
  return { lastMotionPage, pinChoices, transition };
}
/** Small presentation choices only; no project snapshots or authored tracks are retained. */
export function motionDockAtoms(engine: EnginePort) {
  let atoms = scopes.get(engine);
  if (!atoms) {
    atoms = createAtoms(engine);
    scopes.set(engine, atoms);
  }
  return atoms;
}
