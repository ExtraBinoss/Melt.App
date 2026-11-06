import {
  compareMotionTime,
  resolveMotionProperty,
  type EnginePort,
  type MotionPropertyTarget,
  type CommandCommitInfo,
} from "@musart/core";
import { createMotionTransport } from "../../../services/motion/transport";
import { spatialGesturePreview } from "../../../state/session/spatial-preview";
import { rulerChange } from "../../../services/motion/ruler-change";

/** A committed scalar outside React refs can also be read safely by a render-time store projection. */
export function createNumberFallback(initial: number) {
  let value = initial;
  return {
    read: () => value,
    commit: (next: number) => {
      value = next;
    },
  };
}

interface SummaryEngine extends EnginePort {
  subscribeCommitInfo(listener: (event: CommandCommitInfo) => void): () => void;
}
function summarized(engine: EnginePort): engine is SummaryEngine {
  return "subscribeCommitInfo" in engine && typeof engine.subscribeCommitInfo === "function";
}
const history = new WeakMap<EnginePort, { listeners: Set<() => void>; stop: () => void }>();
/** Ruler history still cancels drafts; one metadata listener distinguishes it from a harmless ruler toggle. */
function observeHistory(engine: SummaryEngine, listener: () => void) {
  let entry = history.get(engine);
  if (!entry) {
    const listeners = new Set<() => void>();
    entry = {
      listeners,
      stop: engine.subscribeCommitInfo((event) => {
        if (event.kind === "undo" || event.kind === "redo" || event.kind === "load")
          for (const invalidate of listeners) invalidate();
      }),
    };
    history.set(engine, entry);
  }
  const owned = entry;
  owned.listeners.add(listener);
  return () => {
    owned.listeners.delete(listener);
    if (!owned.listeners.size) {
      owned.stop();
      history.delete(engine);
    }
  };
}

/** Native-field invalidation and the tiny React owner projection share one transport subscription. */
export function createNumberPresentation(
  engine: EnginePort,
  addresses: readonly MotionPropertyTarget[],
  displayScale: number,
  fallback: () => number,
  rangeSensitive = false,
) {
  const transport = createMotionTransport(engine);
  const spatial = spatialGesturePreview(engine);
  const listeners = new Set<() => void>();
  const owners = new Set<() => void>();
  let stop: (() => void) | undefined;
  const read = () => {
    const snapshot = engine.getSnapshot();
    const page =
      spatial.read() ??
      transport.readFrame() ??
      snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
    const values = addresses.map((address) => resolveMotionProperty(page, address)?.value);
    return typeof values[0] !== "number"
      ? fallback()
      : values.some((value) => value !== values[0])
        ? null
        : values[0] * displayScale;
  };
  const ownerFor = (snapshot: ReturnType<EnginePort["getSnapshot"]>, value: number | null) =>
    JSON.stringify([
      snapshot.project.id,
      snapshot.pageId,
      value === null,
      ...(rangeSensitive ? [value] : []),
    ]);
  const readOwner = () => ownerFor(engine.getSnapshot(), read());
  const emitFields = () => {
    for (const listener of listeners) listener();
  };
  const invalidate = () => {
    emitFields();
    for (const listener of owners) listener();
  };
  const connect = () => {
    if (stop) return;
    let snapshot = engine.getSnapshot(),
      state = transport.read(),
      value = read(),
      owner = readOwner();
    const stopHistory = summarized(engine) ? observeHistory(engine, emitFields) : () => {};
    const update = () => {
      const nextSnapshot = engine.getSnapshot(),
        next = transport.read(),
        nextValue = read();
      const nextOwner = ownerFor(nextSnapshot, nextValue);
      const compatibleRulers =
        summarized(engine) &&
        snapshot.selection === nextSnapshot.selection &&
        rulerChange(snapshot, nextSnapshot) !== null;
      const changed =
        (snapshot !== nextSnapshot && !compatibleRulers) ||
        !Object.is(value, nextValue) ||
        state.mode !== next.mode ||
        state.compositionId !== next.compositionId ||
        compareMotionTime(state.time, next.time) !== 0;
      const ownerChanged = owner !== nextOwner;
      snapshot = nextSnapshot;
      state = next;
      value = nextValue;
      owner = nextOwner;
      if (changed) emitFields();
      if (ownerChanged) for (const listener of owners) listener();
    };
    const stopTransport = transport.subscribe(update);
    const stopSpatial = spatial.subscribe(update);
    stop = () => {
      stopSpatial();
      stopTransport();
      stopHistory();
    };
  };
  const subscribeTo = (set: Set<() => void>, listener: () => void) => {
    set.add(listener);
    connect();
    return () => {
      set.delete(listener);
      if (!listeners.size && !owners.size) {
        stop?.();
        stop = undefined;
      }
    };
  };
  return {
    read,
    readOwner,
    invalidate,
    subscribe: (listener: () => void) => subscribeTo(listeners, listener),
    subscribeOwner: (listener: () => void) => subscribeTo(owners, listener),
  };
}
