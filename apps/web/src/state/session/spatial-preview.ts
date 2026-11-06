import type { Composition, EnginePort, SessionSnapshot } from "@musart/core";

/** Native gizmo drafts are a transient field presentation, never a React/document update. */
function createSpatialPreview(engine: EnginePort) {
  let held: { owner: object; origin: SessionSnapshot; page: Composition } | null = null;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  return {
    read: () => {
      const snapshot = engine.getSnapshot();
      return held &&
        snapshot.project === held.origin.project &&
        snapshot.pageId === held.origin.pageId &&
        snapshot.selection === held.origin.selection
        ? held.page
        : null;
    },
    publish(owner: object, origin: SessionSnapshot, page: Composition) {
      held = { owner, origin, page };
      emit();
    },
    clear(owner: object) {
      if (held?.owner !== owner) return;
      held = null;
      emit();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
const previews = new WeakMap<EnginePort, ReturnType<typeof createSpatialPreview>>();
export function spatialGesturePreview(engine: EnginePort) {
  let preview = previews.get(engine);
  if (!preview) {
    preview = createSpatialPreview(engine);
    previews.set(engine, preview);
  }
  return preview;
}
